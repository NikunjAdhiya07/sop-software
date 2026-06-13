/**
 * Resolve PDF vs Word from the stored path first — SOPLibrary rows often set fileType=pdf while fileUrl still points at a .docx.
 * Using declared type before extension causes PDF links to open/download the wrong file and breaks DOCX preview routing.
 */
export function fileKindFromStoredPath(path: string, declaredType?: string): 'pdf' | 'docx' | 'doc' {
  const p = (path || '').trim();
  const base = p.split(/[?#]/)[0];
  const fromPath = base.match(/\.(pdf|docx|doc)$/i)?.[1]?.toLowerCase();
  if (fromPath === 'pdf') return 'pdf';
  if (fromPath === 'doc') return 'doc';
  if (fromPath === 'docx') return 'docx';

  const h = (declaredType || '').toLowerCase().replace(/^\./, '');
  if (h === 'pdf') return 'pdf';
  if (h === 'doc') return 'doc';
  if (h === 'docx') return 'docx';

  return 'docx';
}

export function fileKindToLabel(kind: 'pdf' | 'docx' | 'doc'): string {
  if (kind === 'pdf') return 'PDF';
  if (kind === 'doc') return 'DOC';
  return 'DOCX';
}
