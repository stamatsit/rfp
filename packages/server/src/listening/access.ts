/**
 * Topic Ideation access. LISTENING_ALLOWLIST is a comma-separated email list;
 * unset means the soft-launch list below, in every environment (no dev open
 * access: the tool spends a shared daily Google allowance). Production leaves
 * it unset. Keep in step with TOPIC_IDEATION_ALLOW in the client's
 * lib/featureAccess.ts, which only decides who sees the tile.
 */
const DEFAULT_ALLOWLIST = [
  "eric.yerke@stamats.com",
  // Content Marketing, the team the tool was built for (2026-10-09).
  "joe.volk@stamats.com",
  "mariah.tang@stamats.com",
]

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
