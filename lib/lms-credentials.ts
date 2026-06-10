import Employee from '@/models/Employee';

/** Escape a string for safe use inside a RegExp (usernames contain a dot). */
export function escapeRegex(s: string): string {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a login handle from an employee's full name:
 *   "Abbas Mehdi"        → "Abbas.Mehdi"
 *   "Aakash Aghara"      → "Aakash.Aghara"
 *   "Ravi Kumar Sharma"  → "Ravi.Sharma"   (first + last token)
 *   "Ajay"               → "Ajay"
 * Original casing is preserved so credentials read naturally.
 */
function baseUsername(name: string): string {
  const parts = String(name || '')
    .replace(/[^a-zA-Z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return 'user';
  if (parts.length === 1) return parts[0];
  return `${parts[0]}.${parts[parts.length - 1]}`;
}

/** The first name, used as the password prefix. "Abbas Mehdi" → "Abbas". */
function firstName(name: string): string {
  const first = String(name || '')
    .replace(/[^a-zA-Z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)[0];
  return first || 'User';
}

/**
 * Generate a unique `lmsUsername` for an employee, appending a numeric suffix
 * on collision (Abbas.Mehdi, Abbas.Mehdi2, …). Matching is case-insensitive so
 * we never create handles that differ only by case. `excludeId` lets a record
 * keep/check its own handle when regenerating.
 */
export async function generateUniqueLmsUsername(
  name: string,
  excludeId?: string,
): Promise<string> {
  const base = baseUsername(name);

  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? base : `${base}${n}`;
    const filter: Record<string, unknown> = {
      lmsUsername: new RegExp(`^${escapeRegex(candidate)}$`, 'i'),
    };
    if (excludeId) filter._id = { $ne: excludeId };
    const existing = await Employee.exists(filter);
    if (!existing) return candidate;
  }
}

/**
 * Build an auto password from the first name plus four random digits,
 * e.g. "Abbas Mehdi" → "Abbas@4271".
 */
export function generateAutoPassword(name: string): string {
  const digits = Math.floor(1000 + Math.random() * 9000); // 1000–9999
  return `${firstName(name)}@${digits}`;
}
