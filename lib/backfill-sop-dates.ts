import { connectDB } from "@/lib/mongodb";
import SOP from "@/models/SOP";
import { invalidateDashboardSopsCache } from "@/lib/cache";
import {
  resolveSopDatesFromContent,
  sopDatesToDbFields,
} from "@/lib/sop-dates";
import type { ISOP } from "@/models/SOP";

function familyKey(record: ISOP): string {
  const base = record.sopBaseId ?? record.identifier;
  const version = record.versionNum ?? 0;
  return `${base}::${version}`;
}

function pickContentRecord(records: ISOP[]): ISOP | undefined {
  const ranked = [...records].sort((a, b) => {
    const score = (r: ISOP) => {
      let s = 0;
      if (r.language !== "Gujarati") s += 10;
      if (r.fileType === "docx") s += 5;
      if (r.content && !r.content.startsWith("[")) s += 2;
      return s;
    };
    return score(b) - score(a);
  });
  return ranked.find((r) => r.fileType === "docx" && r.content && !r.content.startsWith("["));
}

/**
 * Re-derive effective / review / expiry dates from stored DOCX content for each SOP family.
 */
export async function backfillSopDates() {
  await connectDB();

  const records = await SOP.find({ fileType: "docx", isObsolete: { $ne: true } });
  const families = new Map<string, ISOP[]>();

  for (const record of records) {
    const key = familyKey(record);
    const list = families.get(key) ?? [];
    list.push(record);
    families.set(key, list);
  }

  let updatedFamilies = 0;
  let updatedRecords = 0;
  let skipped = 0;
  const changes: Array<{
    identifier: string;
    oldExpiry?: string;
    newExpiry?: string;
    reviewDate?: string;
  }> = [];

  for (const [, group] of families) {
    const source = pickContentRecord(group);
    if (!source?.content) {
      skipped++;
      continue;
    }

    const resolved = resolveSopDatesFromContent(source.content);
    const fields = sopDatesToDbFields(resolved);
    if (!fields.expiryDate && !fields.effectiveDate && !fields.reviewDate) {
      skipped++;
      continue;
    }

    const primary = group.find((r) => r.identifier === source.identifier) ?? source;
    const oldExpiry = primary.expiryDate?.toISOString();

    for (const record of group) {
      await record.updateOne(fields);
      updatedRecords++;
    }

    updatedFamilies++;
    changes.push({
      identifier: primary.identifier,
      oldExpiry,
      newExpiry: fields.expiryDate?.toISOString(),
      reviewDate: fields.reviewDate?.toISOString(),
    });
  }

  invalidateDashboardSopsCache();

  return {
    updatedFamilies,
    updatedRecords,
    skipped,
    totalFamilies: families.size,
    changes: changes.slice(0, 100),
  };
}
