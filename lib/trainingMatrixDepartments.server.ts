import { getDashboardDepartments } from "@/lib/dashboardDepartments";
import {
  TRAINING_MATRIX_CORE_DEPARTMENTS,
  canonTrainingMatrixDepartment,
  isTrainingMatrixDepartmentName,
} from "@/lib/trainingMatrixDepartments";

/**
 * Live department universe for Training Matrix (server-only):
 * core 7 (for existing Excel/upload compatibility) ∪ dashboard departments
 * (custom depts like "abcd") with Engineering aliases collapsed to "Engineering".
 */
export async function getTrainingMatrixDepartments(): Promise<string[]> {
  const dashboard = await getDashboardDepartments();
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (name: string) => {
    const key = name.toLowerCase();
    if (!name || seen.has(key) || !isTrainingMatrixDepartmentName(name)) return;
    seen.add(key);
    out.push(name);
  };

  for (const core of TRAINING_MATRIX_CORE_DEPARTMENTS) push(core);

  for (const raw of dashboard) {
    const canon = canonTrainingMatrixDepartment(raw);
    // Skip core aliases already added; keep true custom names as stored on dashboard
    // when they are not a core alias (e.g. "abcd").
    if (
      (TRAINING_MATRIX_CORE_DEPARTMENTS as readonly string[]).some(
        (c) => c.toLowerCase() === canon.toLowerCase(),
      )
    ) {
      continue;
    }
    push(raw.trim() || canon);
  }

  return out;
}
