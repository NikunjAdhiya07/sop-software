/**
 * One-off repair: restore the English Engineering & Maintenance SOP records
 * that were overwritten in place by the Gujarati batch on 09 Jun 2026.
 *
 * The Gujarati files carried no language hint in their paths ("MAGE/...",
 * "Scan File/MAGE/...") and scanned PDFs had no extractable text, so they were
 * classified "English" and the upsert matched + overwrote the English records
 * uploaded an hour earlier. The English files themselves survive on Bunny CDN
 * under Engineering_and_Maintenance/<ID>/English/<type>/ — this script
 * recreates their DB records from those files, and renames the two records
 * whose identifier was taken from a typo'd folder (PRGE24/25 → PREG24/25).
 *
 * Run:  npx tsx scripts/restore-em-english.ts --dry
 *       npx tsx scripts/restore-em-english.ts
 */
import fs from "fs";
import { createHash } from "crypto";
import mongoose from "mongoose";
import { extractTextFromBuffer } from "@/lib/extractContent";
import {
  baseIdentifierFromIdentifier,
  deriveSopRecordName,
  defaultExpiryDate,
  groupSOPRecords,
  sopVersionFields,
  versionFromIdentifier,
} from "@/lib/sop-utils";
import { resolveSopDatesFromContent, sopDatesToDbFields } from "@/lib/sop-dates";

function loadEnv() {
  const env = fs.readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const CDN_DEPT = "Engineering_and_Maintenance";
const TYPO_RENAMES: Array<[string, string]> = [
  ["PRGE24-00", "PREG24-00"],
  ["PRGE25-00", "PREG25-00"],
];

interface StorageEntry {
  ObjectName: string;
  IsDirectory: boolean;
  Length: number;
  LastChanged: string;
}

async function listStorage(path: string): Promise<StorageEntry[]> {
  const host = process.env.BUNNY_STORAGE_HOSTNAME!;
  const zone = process.env.BUNNY_STORAGE_ZONE!;
  const key = process.env.BUNNY_STORAGE_PASSWORD!;
  const url = `https://${host}/${zone}/${path.replace(/^\//, "").replace(/\/?$/, "/")}`;
  const res = await fetch(url, { headers: { AccessKey: key } });
  if (!res.ok) throw new Error(`Bunny list ${path} failed: ${res.status}`);
  return res.json();
}

async function main() {
  loadEnv();
  const DRY = process.argv.includes("--dry");
  await mongoose.connect(process.env.MONGODB_URI!);
  const col = mongoose.connection.collection("sops");
  const pullZone = process.env.BUNNY_PULL_ZONE_URL!.replace(/\/$/, "");

  // 1. Fix records whose identifier came from a typo'd folder name so they
  //    group with their Gujarati counterparts.
  for (const [from, to] of TYPO_RENAMES) {
    const base = baseIdentifierFromIdentifier(to);
    const hit = await col.countDocuments({ identifier: from });
    console.log(`rename ${from} -> ${to} (${hit} records)`);
    if (!DRY && hit) {
      await col.updateMany(
        { identifier: from },
        { $set: { identifier: to, sopBaseId: base } },
      );
    }
  }

  // 2. Recreate English records from the surviving CDN files.
  const idDirs = (await listStorage(`/${CDN_DEPT}`)).filter((e) => e.IsDirectory);
  let created = 0, skipped = 0, failed = 0;

  for (const dir of idDirs) {
    const cdnId = dir.ObjectName;
    const identifier =
      TYPO_RENAMES.find(([from]) => from === cdnId)?.[1] ?? cdnId;
    const version = versionFromIdentifier(identifier) ?? "1.0";
    const { sopBaseId, versionNum, version: resolvedVersion } = sopVersionFields(
      identifier,
      version,
      undefined,
    );

    // Family sibling supplies the department string, location and fallback dates.
    const sibling = await col.findOne({ sopBaseId, versionNum, language: "Gujarati" });

    let docxDates: ReturnType<typeof sopDatesToDbFields> = {};
    for (const fileType of ["docx", "pdf"] as const) {
      try {
        const files = (
          await listStorage(`/${CDN_DEPT}/${cdnId}/English/${fileType}`).catch(() => [])
        ).filter((e) => !e.IsDirectory);
        if (!files.length) continue;
        const file = files[0];

        const exists = await col.findOne({
          sopBaseId,
          versionNum,
          language: "English",
          fileType,
          isObsolete: { $ne: true },
        });
        if (exists) {
          skipped++;
          continue;
        }

        const fileUrl = `${pullZone}/${CDN_DEPT}/${cdnId}/English/${fileType}/${file.ObjectName}`;
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`fetch ${fileUrl} -> ${res.status}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        const content = await extractTextFromBuffer(buffer, fileType);

        const name = deriveSopRecordName({
          identifier,
          language: "English",
          fileType,
          content,
          originalFileName: file.ObjectName,
        });

        const dateFields =
          fileType === "docx"
            ? sopDatesToDbFields(resolveSopDatesFromContent(content))
            : docxDates;
        if (fileType === "docx") docxDates = dateFields;

        const now = new Date();
        const uploadedAt = file.LastChanged
          ? new Date(`${file.LastChanged}Z`)
          : now;

        const doc = {
          name,
          identifier,
          department: sibling?.department ?? "Engineering and Maintenance",
          fileUrl,
          fileType,
          content,
          language: "English",
          checksum: createHash("sha256").update(buffer).digest("hex"),
          version: resolvedVersion,
          sopBaseId,
          versionNum,
          location: sibling?.location,
          guidelineReference: sibling?.guidelineReference,
          originalFileName: file.ObjectName,
          metadata: { fileSize: file.Length },
          sopDocuments: [
            { fileName: file.ObjectName, filePath: fileUrl, fileType, language: "English" },
          ],
          effectiveDate: dateFields.effectiveDate ?? sibling?.effectiveDate ?? now,
          expiryDate:
            dateFields.expiryDate ?? sibling?.expiryDate ?? defaultExpiryDate(24),
          ...(dateFields.reviewDate ? { reviewDate: dateFields.reviewDate } : {}),
          status: "uploaded",
          pipelineStatus: "idle",
          complianceStatus: "pending",
          mcqCount: 0,
          subfolderLevel: 0,
          validityPeriod: 24,
          isObsolete: false,
          uploadedAt,
          createdAt: now,
          updatedAt: now,
        };

        console.log(
          `create ${identifier} [English/${fileType}] "${name}" exp:${doc.expiryDate?.toISOString?.().slice(0, 10)}`,
        );
        if (!DRY) await col.insertOne(doc as never);
        created++;
      } catch (e) {
        failed++;
        console.log(`FAIL ${identifier} [${fileType}]: ${(e as Error).message}`);
      }
    }
  }

  console.log(JSON.stringify({ dryRun: DRY, created, skipped, failed }, null, 2));

  // 3. Verify: regroup E&M and report what the dashboard will show.
  const records = await col
    .find({ department: /engineering/i, isObsolete: { $ne: true } })
    .toArray();
  const registry = groupSOPRecords(records as never[]);
  const active = registry.filter((r) => !r.isObsolete);
  const dual = active.filter((r) => r.language === "ENG-GUJ").length;
  const withEn = active.filter((r) => r.language !== "GUJ").length;
  const withGu = active.filter((r) => r.language !== "ENG").length;
  console.log(
    `E&M after repair: ${active.length} SOPs, dual=${dual}, w/EN=${withEn}, w/GU=${withGu}`,
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
