import Employee from '@/models/Employee';

/**
 * Build a human-friendly base login handle from an employee's name,
 * e.g. "Aakash Aghara" → "aakash.a", "Ajay" → "ajay".
 */
function baseUsername(name: string): string {
  const parts = String(name || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return 'user';
  if (parts.length === 1) return parts[0];
  return `${parts[0]}.${parts[1][0]}`;
}

/**
 * Generate a unique `lmsUsername` for an employee, appending a numeric suffix
 * on collision (aakash.a, aakash.a2, aakash.a3, …). `excludeId` lets a record
 * keep its own handle when regenerating.
 */
export async function generateUniqueLmsUsername(
  name: string,
  excludeId?: string,
): Promise<string> {
  const base = baseUsername(name);

  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? base : `${base}${n}`;
    const filter: Record<string, unknown> = { lmsUsername: candidate };
    if (excludeId) filter._id = { $ne: excludeId };
    const existing = await Employee.exists(filter);
    if (!existing) return candidate;
  }
}
