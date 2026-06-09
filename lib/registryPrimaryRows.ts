/** Family key for deduping registry rows (e.g. MAGE1-8 → MAGE:1). */
function sopFamilyKeyFromIdentifier(id: string): string | null {
  const code = String(id || '').trim().toUpperCase().replace(/_/g, '-');
  const m = code.match(/^([A-Z]{2,6})(\d+)-(\d+)$/);
  if (!m) return null;
  return `${m[1]}:${parseInt(m[2], 10)}`;
}

export function isArtifactOnlyRegistryRow(_row: unknown): boolean {
  return false;
}

export function isStandardRegistrySopNumber(row: { sopNo?: string; identifier?: string }): boolean {
  const sopNo = String(row?.sopNo ?? row?.identifier ?? '').trim();
  if (!sopNo) return false;
  return sopFamilyKeyFromIdentifier(sopNo) !== null;
}

export function filterPrimaryRegistryRows<T extends { sopNo?: string; identifier?: string }>(
  data: T[] | undefined | null,
): T[] {
  if (!data?.length) return [];
  return data.filter(
    (row) => !isArtifactOnlyRegistryRow(row) && isStandardRegistrySopNumber(row),
  );
}

function parseRevisionFromSopNo(sopNo: string): number {
  const m = String(sopNo || '').trim().match(/-(\d+)$/);
  return m ? parseInt(m[1]!, 10) || 0 : 0;
}

export function filterPrimaryRegistryRowsUniqueByFamily<T extends { sopNo?: string; identifier?: string }>(
  data: T[] | undefined | null,
): T[] {
  const primary = filterPrimaryRegistryRows(data);
  if (!primary.length) return [];
  const best = new Map<string, T>();
  for (const row of primary) {
    const sopNo = String(row?.sopNo ?? row?.identifier ?? '').trim();
    const fk = sopFamilyKeyFromIdentifier(sopNo);
    if (!fk) continue;
    const existing = best.get(fk);
    if (!existing) {
      best.set(fk, row);
      continue;
    }
    const existingRev = parseRevisionFromSopNo(String(existing?.sopNo ?? existing?.identifier ?? ''));
    const currentRev = parseRevisionFromSopNo(sopNo);
    if (currentRev > existingRev) best.set(fk, row);
  }
  return Array.from(best.values());
}
