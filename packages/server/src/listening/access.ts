/**
 * Topic Ideation access. LISTENING_ALLOWLIST is a comma-separated email list;
 * unset means Eric only, in every environment (no dev open access: the tool
 * spends a shared daily Google allowance).
 */
const DEFAULT_ALLOWLIST = ["eric.yerke@stamats.com"]

export function listeningAllowlist(): string[] {
  const raw = process.env["LISTENING_ALLOWLIST"]
  if (!raw?.trim()) return DEFAULT_ALLOWLIST
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function listeningAllowed(email: string | null | undefined): boolean {
  if (!email) return false
  return listeningAllowlist().includes(email.trim().toLowerCase())
}
