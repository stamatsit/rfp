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

/**
 * Admins can open and export every topic anyone has scanned, private ones
 * included (read only: rescan, refresh, delete and sharing stay with the
 * owner). LISTENING_ADMINS overrides the default, comma-separated.
 */
const DEFAULT_ADMINS = ["eric.yerke@stamats.com"]

export function listeningAdmins(): string[] {
  const raw = process.env["LISTENING_ADMINS"]
  if (!raw?.trim()) return DEFAULT_ADMINS
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isListeningAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const who = email.trim().toLowerCase()
  return listeningAllowed(who) && listeningAdmins().includes(who)
}
