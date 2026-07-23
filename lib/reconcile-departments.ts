import { connectDB } from "@/lib/mongodb";
import SOP from "@/models/SOP";
import Department from "@/models/Department";
import { invalidateDashboardSopsCache } from "@/lib/server-cache";
import { resolveDepartmentForExistingSop } from "@/lib/sop-utils";
import { extractDepartmentFromContent } from "@/lib/sop-content-metadata";
import { isDashboardDepartmentName } from "@/lib/dashboardDepartments";

export async function reconcileAllDepartments(options?: { onlyGeneral?: boolean }) {
  await connectDB();
  const query = options?.onlyGeneral !== false ? { department: "General" } : {};
  const [records, knownDepartments] = await Promise.all([
    SOP.find(query),
    Department.distinct("name") as Promise<string[]>,
  ]);

  let updated = 0;
  let skipped = 0;
  let unchanged = 0;
  const changes: Array<{ identifier: string; from: string; to: string }> = [];
  const known = [...knownDepartments];

  for (const record of records) {
    const contentDepartment = record.content
      ? extractDepartmentFromContent(record.content)
      : undefined;

    const next = resolveDepartmentForExistingSop(
      {
        identifier: record.identifier,
        folderPath: record.folderPath,
        fileUrl: record.fileUrl,
        originalFileName: record.originalFileName,
        deptManualOverride: record.deptManualOverride,
        contentDepartment,
      },
      known,
    );

    if (!next) {
      skipped++;
      continue;
    }

    if (next === record.department) {
      unchanged++;
      continue;
    }

    await record.updateOne({ department: next });
    if (isDashboardDepartmentName(next) && !known.some((d) => d.toLowerCase() === next.toLowerCase())) {
      await Department.updateOne(
        { name: next },
        { $setOnInsert: { name: next } },
        { upsert: true },
      );
      known.push(next);
    }
    changes.push({
      identifier: record.identifier,
      from: record.department,
      to: next,
    });
    updated++;
  }

  if (updated > 0) {
    invalidateDashboardSopsCache();
  }

  return { updated, skipped, unchanged, total: records.length, changes };
}
