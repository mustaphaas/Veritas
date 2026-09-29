// One place decides how a satellite verdict is worded and coloured, so the
// Project Map popup and the chat card can never disagree about the same result.

export type VerdictLimitation = { code: string; message: string };

export type PresentableVerdict = {
  status: "present" | "absent" | "inconclusive";
  limitation?: VerdictLimitation | null;
};

export function presentVerdict(verdict: PresentableVerdict): { label: string; color: string } {
  // Household-scale systems are not "inconclusive" in the ordinary sense: the
  // imagery cannot answer the question at all, and the label should say so.
  if (verdict.limitation?.code === "distributed_systems") {
    return { label: "Not verifiable from imagery", color: "#64748b" };
  }
  if (verdict.status === "present") return { label: "Infrastructure detected", color: "#159254" };
  if (verdict.status === "absent") return { label: "No qualifying infrastructure detected", color: "#c0392b" };
  return { label: "Inconclusive", color: "#b8860b" };
}
