import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { exportFileName, exportAllSopsToFilesFolder } from "@/lib/export-sops-to-files";
import { fetchBunnyFile } from "@/lib/bunnyStorage";
import { getFilesImportDir } from "@/lib/sop-files-import";
import {
  maxVersionInGroup,
  sopFamilyGroupKey,
  versionFromIdentifier,
} from "@/lib/sop-utils";
import SOP, { type ISOP } from "@/models/SOP";

function loadEnv() {
  try {
    for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* use process env */
  }
}

function parseVersionNum(version: string): number {
  const n = parseInt(String(version).split(".")[0], 10);
  return Number.isFinite(n) ? n : 0;
}

function getRecordVersionNum(record: ISOP): number {
  if (record.versionNum != null) return record.versionNum;
  const fromId = versionFromIdentifier(record.identifier);
  return fromId != null ? parseVersionNum(fromId) : 0;
}

const RETRY_IDENTIFIERS = ["STGE12-2", "STGE12-02", "PRPA07-3", "PRCL20-2", "QAGE136-00"];

async function main() {
  loadEnv();
  process.env.BUNNY_FETCH_TIMEOUT_MS = process.env.BUNNY_FETCH_TIMEOUT_MS || "600000";

  const rootDir = getFilesImportDir();
  await mongoose.connect(process.env.MONGODB_URI!);

  const records = await SOP.find({
    identifier: { $in: RETRY_IDENTIFIERS },
    fileUrl: { $exists: true, $ne: "" },
    fileType: { $in: ["pdf", "docx"] },
  }).lean<ISOP[]>();

  const families = new Map<string, ISOP[]>();
  for (const record of records) {
    const key = sopFamilyGroupKey(record);
    const list = families.get(key) ?? [];
    list.push(record);
    families.set(key, list);
  }

  let ok = 0;
  let fail = 0;

  for (const record of records) {
    const family = families.get(sopFamilyGroupKey(record)) ?? [record];
    const active = family.filter((r) => !r.isObsolete);
    const pool = active.length ? active : family;
    const isObsoleteFamily = active.length === 0;
    const currentNum = parseVersionNum(maxVersionInGroup(pool));
    const verNum = getRecordVersionNum(record);
    const isCurrent = verNum === currentNum;

    let destDir: string;
    if (isObsoleteFamily) destDir = path.join(rootDir, "_obsolete");
    else if (isCurrent) destDir = rootDir;
    else destDir = path.join(rootDir, "versions");

    const destPath = path.join(destDir, exportFileName(record));

    try {
      const stat = await fs.promises.stat(destPath);
      if (stat.size > 0) {
        console.log(`SKIP: ${exportFileName(record)}`);
        ok++;
        continue;
      }
    } catch {
      /* missing */
    }

    console.log(`Fetching ${record.identifier} (${record.fileType})…`);
    const buf = await fetchBunnyFile(record.fileUrl);
    if (!buf?.length) {
      console.log(`FAIL: ${exportFileName(record)}`);
      fail++;
      continue;
    }

    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
    await fs.promises.writeFile(destPath, buf);
    console.log(`OK: ${destPath} (${buf.length} bytes)`);
    ok++;
  }

  console.log(`\nRetry done: ${ok} ok, ${fail} failed`);
  await mongoose.disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
