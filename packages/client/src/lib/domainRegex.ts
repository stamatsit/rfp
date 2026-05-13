/**
 * Client-side mirror of the canonical DOMAIN_RE.
 *
 * Source of truth lives at:
 *   packages/server/src/lib/clientLookup.ts (export const DOMAIN_RE)
 *
 * If you change one, change the other. Both must stay byte-identical.
 *
 * Each label: starts/ends with alphanumeric, no leading/trailing hyphens, no
 * consecutive dots, TLD is 2+ letters. Lowercased before testing (test() does
 * NOT lowercase for you).
 */
export const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/

export function isValidDomain(input: string): boolean {
  return DOMAIN_RE.test(input.toLowerCase().trim())
}
