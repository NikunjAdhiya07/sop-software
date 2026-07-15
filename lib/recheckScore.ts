export interface ScorableResult {
  status: "addressed" | "open";
  ignored: boolean;
}
export interface ScorableIssue {
  ignored: boolean;
}

/**
 * Score a re-check run 0–10. Addressed and ignored points count as satisfied;
 * open (non-ignored) points and material new issues pull the score down.
 */
export function computeRecheckScore(
  results: ScorableResult[],
  newIssues: ScorableIssue[],
): { score: number; verdict: "compliant" | "issues"; resolvedCount: number; openCount: number } {
  const considered = results.length;
  const openActive = results.filter((r) => r.status === "open" && !r.ignored).length;
  const addressed = results.filter((r) => r.status === "addressed").length;
  const newActive = newIssues.filter((n) => !n.ignored).length;

  const satisfiedFraction = considered > 0 ? (considered - openActive) / considered : 1;
  let score = satisfiedFraction * 10 - Math.min(newActive, 4);
  score = Math.max(0, Math.min(10, score));
  score = Math.round(score * 10) / 10;

  const verdict: "compliant" | "issues" = openActive === 0 && newActive === 0 ? "compliant" : "issues";
  return { score, verdict, resolvedCount: addressed, openCount: openActive };
}
