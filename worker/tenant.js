// Single source of truth for tenant (consultant firm) comparison.
// Normalised (case/whitespace-insensitive) and FAIL-CLOSED: an empty/missing value never matches,
// so null === null or "" === "" can never grant access.
export function sameFirm(a, b) {
  const x = String(a ?? "").trim().toLowerCase();
  return x !== "" && x === String(b ?? "").trim().toLowerCase();
}
