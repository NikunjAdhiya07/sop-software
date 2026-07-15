import type { AnnexureAuditStatus } from "@/lib/compliance-sop-content";

export type AnnexureReportFields = {
  annexureStatus?: AnnexureAuditStatus | string;
  annexuresChecked?: boolean;
  linkedAnnexureCount?: number;
  /** Live count from SOP.sopDocuments (enriched on list/detail fetch). */
  liveLinkedAnnexureCount?: number;
  annexuresIncluded?: { label: string; fileName?: string; chars?: number }[];
  annexuresSkipped?: { label: string; fileName?: string; reason?: string }[];
};

export function resolveAnnexureStatus(report: AnnexureReportFields): AnnexureAuditStatus {
  if (report.annexuresChecked === true || report.annexureStatus === "checked") {
    return "checked";
  }

  const live =
    report.liveLinkedAnnexureCount ??
    report.linkedAnnexureCount ??
    0;
  const skipped = report.annexuresSkipped?.length ?? 0;

  if (report.annexureStatus === "linked-unread" || (skipped > 0 && live > 0)) {
    return "linked-unread";
  }

  // Annexures are connected on the SOP, but this compliance run did not audit them
  // (legacy reports, or run before linking). Prefer this over a false "none connected".
  if (live > 0 || report.annexureStatus === "not-checked") {
    return "not-checked";
  }

  if (report.annexureStatus === "none") return "none";

  return "none";
}

export function annexureStatusLabel(status: AnnexureAuditStatus): string {
  switch (status) {
    case "checked":
      return "Done — annexures checked";
    case "not-checked":
      return "Connected — not checked yet";
    case "linked-unread":
      return "Annexures linked (not readable)";
    case "none":
    default:
      return "No annexure connected";
  }
}

export function annexureStatusShortLabel(status: AnnexureAuditStatus): string {
  switch (status) {
    case "checked":
      return "Done";
    case "not-checked":
      return "Connected";
    case "linked-unread":
      return "Linked / unread";
    case "none":
    default:
      return "None connected";
  }
}

export function annexureStatusTitle(report: AnnexureReportFields): string {
  const status = resolveAnnexureStatus(report);
  const live = report.liveLinkedAnnexureCount ?? report.linkedAnnexureCount ?? 0;
  if (status === "checked") {
    const names = (report.annexuresIncluded ?? [])
      .map((a) => a.label || a.fileName)
      .filter(Boolean)
      .join(", ");
    return names
      ? `Annexures were connected and checked with guidelines: ${names}`
      : "Annexures were connected and checked with guidelines for this run.";
  }
  if (status === "not-checked") {
    return live > 0
      ? `${live} annexure(s) are connected to this SOP, but this compliance run did not check them against guidelines. Re-run compliance to include them.`
      : "Annexures are connected to this SOP, but this compliance run did not check them. Re-run compliance.";
  }
  if (status === "linked-unread") {
    const skipped = (report.annexuresSkipped ?? [])
      .map((s) => `${s.label || s.fileName} (${s.reason || "unreadable"})`)
      .join("; ");
    return skipped
      ? `Annexures are connected but could not be read: ${skipped}`
      : "Annexures are connected to this SOP but their text could not be extracted for the guideline audit.";
  }
  return "No annexure is connected to this SOP.";
}

export function annexureStatusBadgeClass(status: AnnexureAuditStatus): string {
  switch (status) {
    case "checked":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "not-checked":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "linked-unread":
      return "bg-orange-50 text-orange-800 border-orange-200";
    case "none":
    default:
      return "bg-slate-50 text-slate-600 border-slate-200";
  }
}
