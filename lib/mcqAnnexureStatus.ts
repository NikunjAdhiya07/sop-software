/**
 * Whether the MCQs in an SOP's bank were built with its linked annexures.
 *
 * - none: no annexure is connected to the SOP, so the MCQs are main-SOP-only by design
 * - included: at least one linked annexure's text was folded into generation
 * - linked-not-used: annexures are connected but no bank recorded using them —
 *   either the MCQs predate the linking, or the files could not be read. Regenerate
 *   to pull them in.
 */
export type McqAnnexureStatus = "none" | "included" | "linked-not-used";

export function deriveMcqAnnexureStatus(input: {
  /** Live count of annexures linked to the SOP family. */
  linkedCount: number;
  /** Annexures recorded as included across the family's active banks. */
  includedCount: number;
}): McqAnnexureStatus {
  if (input.linkedCount <= 0) return "none";
  return input.includedCount > 0 ? "included" : "linked-not-used";
}

export function mcqAnnexureStatusLabel(
  status: McqAnnexureStatus,
  linkedCount: number,
): string {
  const plural = linkedCount === 1 ? "" : "s";
  switch (status) {
    case "included":
      return `${linkedCount} annexure${plural} used in MCQs`;
    case "linked-not-used":
      return `${linkedCount} annexure${plural} linked — not used in MCQs`;
    case "none":
    default:
      return "No annexure connected";
  }
}

export function mcqAnnexureStatusTitle(input: {
  status: McqAnnexureStatus;
  linkedCount: number;
  includedLabels?: string[];
  hasMcqs?: boolean;
}): string {
  const plural = input.linkedCount === 1 ? "" : "s";
  switch (input.status) {
    case "included": {
      const names = (input.includedLabels ?? []).filter(Boolean).join(", ");
      return names
        ? `Annexure content was included when these MCQs were generated: ${names}`
        : "Linked annexure content was included when these MCQs were generated.";
    }
    case "linked-not-used":
      return input.hasMcqs
        ? `${input.linkedCount} annexure${plural} are linked to this SOP, but the current MCQs were not generated from them (linked afterwards, or the files could not be read). Regenerate to include them.`
        : `${input.linkedCount} annexure${plural} are linked to this SOP. Generate MCQs to include their content.`;
    case "none":
    default:
      return "No annexure file is connected to this SOP — MCQs are based on the main SOP content only.";
  }
}

export function mcqAnnexureStatusClass(status: McqAnnexureStatus): string {
  switch (status) {
    case "included":
      return "text-emerald-700";
    case "linked-not-used":
      return "text-amber-700";
    case "none":
    default:
      return "text-gray-400";
  }
}
