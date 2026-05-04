/**
 * Scanner Verification Harness
 *
 * Compares our scanUrl output against standalone axe-core and (optionally) pa11y.
 * Produces a JSON report + human-readable stdout summary.
 *
 * Run:  cd "<project root>" && npx tsx packages/server/scripts/scanner-verify.ts
 */

import { scanUrl } from "../src/services/scannerService.js";
import { JSDOM } from "jsdom";
import axe from "axe-core";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TEST_URLS = [
  "https://www.apple.com",
  "https://stamats.com",
  "https://example.com",
  "https://www.w3.org/WAI/demos/bad/before/home.html",
  "https://www.w3.org/WAI/demos/bad/after/home.html",
  "https://github.com",
];

const PER_URL_TIMEOUT_MS = 60_000;
const PER_ENGINE_TIMEOUT_MS = 30_000;

// Categories from our scanner that are outside axe's scope entirely.
// These should not count as "over-flagged" in the delta.
const EXTENDED_SCOPE_CATEGORIES = new Set([
  "security", "schema", "performance", "links", "structure",
]);

// Rule prefixes that are custom SEO/meta checks, not accessibility
const EXTENDED_SCOPE_RULE_PREFIXES = [
  "security-header-",
  "schema-",
  "meta-description-",
  "meta-title-",
  "og-tags-",
  "twitter-card-",
  "canonical-",
  "robots-",
];

// ---------------------------------------------------------------------------
// Rule-ID mapping across engines
// ---------------------------------------------------------------------------

// Our custom ruleId -> axe raw ruleId (without the "axe-" prefix our scanner adds)
const OUR_TO_AXE: Record<string, string> = {
  "img-alt-missing": "image-alt",
  "img-link-alt-missing": "image-alt",
  "link-name-empty": "link-name",
  "form-label-missing": "label",
  "button-name-empty": "button-name",
  "heading-empty": "empty-heading",
  "html-lang-missing": "html-has-lang",
  "meta-viewport-missing": "meta-viewport",
  "duplicate-id": "duplicate-id",
};

// axe raw ruleId -> pa11y technique pattern fragment
const AXE_TO_PA11Y_FRAGMENT: Record<string, string> = {
  "image-alt": "H37",
  "link-name": "H30",
  "label": "H44",
  "button-name": "H91",
  "empty-heading": "H42",
  "html-has-lang": "H57",
};

// Reverse map: axe raw ruleId -> our ruleId(s)
const AXE_TO_OURS: Record<string, string[]> = {};
for (const [ours, axeId] of Object.entries(OUR_TO_AXE)) {
  (AXE_TO_OURS[axeId] ??= []).push(ours);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SimpleIssue {
  ruleId: string;
  category?: string;
  severity?: string;
  message: string;
}

interface UrlResult {
  url: string;
  fetchError?: string;
  ourScanner: {
    issueCount: number;
    accessibilityIssueCount: number;
    extendedScopeCount: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    issues: SimpleIssue[];
  };
  standaloneAxe: {
    violationRuleCount: number;
    issueCount: number;
    issues: SimpleIssue[];
  };
  pa11y: {
    issueCount: number;
    issues: SimpleIssue[];
    skipped: boolean;
    skipReason?: string;
  };
  delta: {
    weFlaggedTheyDidnt: SimpleIssue[];
    theyFlaggedWeDidnt: Array<SimpleIssue & { engine: string }>;
    severityDisagreements: Array<{
      ruleId: string;
      ourSeverity: string;
      axeSeverity: string;
    }>;
  };
}

interface Report {
  ranAt: string;
  urls: UrlResult[];
  summary: {
    totalUrls: number;
    totalOurIssues: number;
    totalOurAccessibilityOnly: number;
    totalAxeStandalone: number;
    totalPa11y: number;
    averageWeMissed: number;
    averageWeOverFlagged: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isExtendedScope(issue: SimpleIssue): boolean {
  if (issue.category && EXTENDED_SCOPE_CATEGORIES.has(issue.category)) return true;
  if (EXTENDED_SCOPE_RULE_PREFIXES.some((p) => issue.ruleId.startsWith(p))) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Fetch HTML helper
// ---------------------------------------------------------------------------

async function fetchHtml(
  url: string,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; StamatsScanner/1.0)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Standalone axe-core runner
//
// Counts per-node (not per-rule) so numbers are directly comparable to our
// scanner's axe integration, which also emits one ScanIssue per node.
// ---------------------------------------------------------------------------

async function runStandaloneAxe(
  html: string,
  url: string,
): Promise<{ ruleCount: number; issues: SimpleIssue[] }> {
  const dom = new JSDOM(html, {
    url,
    pretendToBeVisual: true,
    runScripts: "outside-only",
  });

  try {
    dom.window.eval(axe.source);

    const tags = ["wcag2a", "wcag2aa", "best-practice"];
    const results = await (dom.window as any).axe.run(
      dom.window.document,
      { runOnly: { type: "tag", values: tags } },
    );

    const issues: SimpleIssue[] = [];
    for (const v of results.violations) {
      // One issue per affected node — matches our scanner's granularity
      for (const node of v.nodes) {
        issues.push({
          ruleId: v.id,
          severity: v.impact ?? "unknown",
          message: v.help,
          category: undefined,
        });
      }
    }
    return { ruleCount: results.violations.length, issues };
  } finally {
    dom.window.close();
  }
}

// ---------------------------------------------------------------------------
// Pa11y runner (best-effort)
// ---------------------------------------------------------------------------

async function runPa11y(url: string): Promise<{
  issues: SimpleIssue[];
  skipped: boolean;
  skipReason?: string;
}> {
  return new Promise((resolveP) => {
    const timeout = setTimeout(() => {
      resolveP({ issues: [], skipped: true, skipReason: "pa11y timed out after 30s" });
    }, PER_ENGINE_TIMEOUT_MS);

    try {
      const child = execFile(
        "npx",
        ["pa11y", "--reporter", "json", "--standard", "WCAG2AA", url],
        { timeout: PER_ENGINE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
        (err, stdout, _stderr) => {
          clearTimeout(timeout);
          if (err) {
            resolveP({
              issues: [],
              skipped: true,
              skipReason: `pa11y error: ${err.message?.slice(0, 200)}`,
            });
            return;
          }
          try {
            const parsed = JSON.parse(stdout);
            const issues: SimpleIssue[] = (
              Array.isArray(parsed) ? parsed : []
            ).map((item: any) => ({
              ruleId: item.code ?? "unknown",
              severity: item.type ?? "unknown",
              message: item.message ?? "",
            }));
            resolveP({ issues, skipped: false });
          } catch {
            resolveP({ issues: [], skipped: true, skipReason: "pa11y returned unparseable JSON" });
          }
        },
      );
      child.on("error", () => {
        clearTimeout(timeout);
        resolveP({ issues: [], skipped: true, skipReason: "pa11y not available" });
      });
    } catch {
      clearTimeout(timeout);
      resolveP({ issues: [], skipped: true, skipReason: "pa11y not installed or not runnable" });
    }
  });
}

// ---------------------------------------------------------------------------
// Delta computation
//
// Only compares issues in the accessibility scope (not security/SEO/schema).
// Uses rule-level (unique ruleId) comparison, not per-node counts.
// ---------------------------------------------------------------------------

function computeDelta(
  ourIssues: SimpleIssue[],
  axeIssues: SimpleIssue[],
  pa11yIssues: SimpleIssue[],
): UrlResult["delta"] {
  // Normalize our rule IDs to axe-equivalent IDs for apples-to-apples comparison
  const ourNormalizedRuleIds = new Set<string>();
  for (const i of ourIssues) {
    if (isExtendedScope(i)) continue; // skip non-a11y issues
    const stripped = i.ruleId.replace(/^axe-/, "");
    ourNormalizedRuleIds.add(OUR_TO_AXE[i.ruleId] ?? stripped);
  }

  const axeRuleIds = new Set(axeIssues.map((i) => i.ruleId));

  // Accessibility issues WE flagged that axe standalone did NOT (rule-level, deduped)
  const weFlaggedTheyDidnt: SimpleIssue[] = [];
  const seenOurRules = new Set<string>();
  for (const issue of ourIssues) {
    if (isExtendedScope(issue)) continue;
    const normalizedId = OUR_TO_AXE[issue.ruleId] ?? issue.ruleId.replace(/^axe-/, "");
    if (seenOurRules.has(normalizedId)) continue;
    seenOurRules.add(normalizedId);
    if (!axeRuleIds.has(normalizedId)) {
      weFlaggedTheyDidnt.push(issue);
    }
  }

  // Issues axe/pa11y flagged that we did NOT (rule-level)
  const theyFlaggedWeDidnt: Array<SimpleIssue & { engine: string }> = [];
  for (const issue of axeIssues) {
    if (!ourNormalizedRuleIds.has(issue.ruleId)) {
      theyFlaggedWeDidnt.push({ ...issue, engine: "axe-standalone" });
    }
  }
  const seenPa11y = new Set<string>();
  for (const issue of pa11yIssues) {
    if (seenPa11y.has(issue.ruleId)) continue;
    seenPa11y.add(issue.ruleId);
    let mapped = false;
    for (const [axeId, fragment] of Object.entries(AXE_TO_PA11Y_FRAGMENT)) {
      if (issue.ruleId.includes(fragment)) {
        if (!ourNormalizedRuleIds.has(axeId)) {
          theyFlaggedWeDidnt.push({ ...issue, engine: "pa11y" });
        }
        mapped = true;
        break;
      }
    }
    if (!mapped && !ourNormalizedRuleIds.has(issue.ruleId)) {
      theyFlaggedWeDidnt.push({ ...issue, engine: "pa11y" });
    }
  }

  // Severity disagreements: our mapped severity vs axe raw impact.
  // Our scanner maps critical/serious -> "error", moderate -> "warning", minor -> "info".
  // Compare only unique rule disagreements.
  const severityDisagreements: UrlResult["delta"]["severityDisagreements"] = [];
  const axeSeverityByRule = new Map<string, string>();
  for (const i of axeIssues) {
    if (!axeSeverityByRule.has(i.ruleId)) {
      axeSeverityByRule.set(i.ruleId, i.severity ?? "unknown");
    }
  }
  const seenSevRules = new Set<string>();
  for (const issue of ourIssues) {
    if (!issue.ruleId.startsWith("axe-")) continue;
    const rawId = issue.ruleId.replace(/^axe-/, "");
    if (seenSevRules.has(rawId)) continue;
    seenSevRules.add(rawId);
    const standaloneImpact = axeSeverityByRule.get(rawId);
    if (!standaloneImpact) continue;
    // Our scanner maps impact to severity; axe-standalone reports raw impact.
    // Both should match because we run the same axe version. But if they don't, flag it.
    if (standaloneImpact !== issue.severity) {
      severityDisagreements.push({
        ruleId: rawId,
        ourSeverity: issue.severity ?? "unknown",
        axeSeverity: standaloneImpact,
      });
    }
  }

  return { weFlaggedTheyDidnt, theyFlaggedWeDidnt, severityDisagreements };
}

// ---------------------------------------------------------------------------
// Timeout helper
// ---------------------------------------------------------------------------

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise((res, rej) => {
    const timer = setTimeout(
      () => rej(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); res(v); },
      (e) => { clearTimeout(timer); rej(e); },
    );
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Scanner Verification Harness");
  console.log("============================\n");

  const results: UrlResult[] = [];
  let totalOur = 0;
  let totalOurA11y = 0;
  let totalAxe = 0;
  let totalPa11y = 0;
  let totalMissed = 0;
  let totalOver = 0;

  for (let i = 0; i < TEST_URLS.length; i++) {
    const url = TEST_URLS[i];
    const label = new URL(url).hostname.replace("www.", "");
    process.stdout.write(`[${i + 1}/${TEST_URLS.length}] ${label}...`);

    // ------ Fetch HTML once for standalone axe ------
    let html: string;
    try {
      html = await withTimeout(fetchHtml(url, PER_ENGINE_TIMEOUT_MS), PER_ENGINE_TIMEOUT_MS, "fetch");
    } catch (err: any) {
      console.log(` FETCH FAILED: ${err.message}`);
      results.push({
        url,
        fetchError: err.message,
        ourScanner: { issueCount: 0, accessibilityIssueCount: 0, extendedScopeCount: 0, byCategory: {}, bySeverity: {}, issues: [] },
        standaloneAxe: { violationRuleCount: 0, issueCount: 0, issues: [] },
        pa11y: { issueCount: 0, issues: [], skipped: true, skipReason: "fetch failed" },
        delta: { weFlaggedTheyDidnt: [], theyFlaggedWeDidnt: [], severityDisagreements: [] },
      });
      continue;
    }

    // ------ Run our scanner ------
    let ourIssues: SimpleIssue[] = [];
    let byCategory: Record<string, number> = {};
    let bySeverity: Record<string, number> = {};
    try {
      const report = await withTimeout(
        scanUrl(url, { wcagLevel: "AA", checkLinks: false }),
        PER_URL_TIMEOUT_MS,
        "our scanner",
      );
      ourIssues = report.issues.map((i) => ({
        ruleId: i.ruleId,
        category: i.category,
        severity: i.severity,
        message: i.message,
      }));
      for (const i of report.issues) {
        byCategory[i.category] = (byCategory[i.category] ?? 0) + 1;
        bySeverity[i.severity] = (bySeverity[i.severity] ?? 0) + 1;
      }
    } catch (err: any) {
      console.log(` OUR SCANNER FAILED: ${err.message}`);
    }

    const a11yCount = ourIssues.filter((i) => !isExtendedScope(i)).length;
    const extCount = ourIssues.length - a11yCount;

    // ------ Run standalone axe ------
    let axeResult = { ruleCount: 0, issues: [] as SimpleIssue[] };
    try {
      axeResult = await withTimeout(
        runStandaloneAxe(html, url),
        PER_ENGINE_TIMEOUT_MS,
        "axe-standalone",
      );
    } catch (err: any) {
      console.log(` AXE-STANDALONE FAILED: ${err.message}`);
    }

    // ------ Run pa11y ------
    const pa11yResult = await runPa11y(url);

    // ------ Compute delta ------
    const delta = computeDelta(ourIssues, axeResult.issues, pa11yResult.issues);

    const missed = delta.theyFlaggedWeDidnt.length;
    const over = delta.weFlaggedTheyDidnt.length;

    totalOur += ourIssues.length;
    totalOurA11y += a11yCount;
    totalAxe += axeResult.issues.length;
    totalPa11y += pa11yResult.issues.length;
    totalMissed += missed;
    totalOver += over;

    console.log(
      ` ours=${ourIssues.length} (a11y=${a11yCount}, ext=${extCount})` +
        ` axe=${axeResult.issues.length} (${axeResult.ruleCount} rules)` +
        ` pa11y=${pa11yResult.skipped ? "skipped" : pa11yResult.issues.length}` +
        ` | delta: missed=${missed} over=${over} sev-mismatch=${delta.severityDisagreements.length}`,
    );

    if (delta.theyFlaggedWeDidnt.length > 0) {
      for (const m of delta.theyFlaggedWeDidnt) {
        console.log(`    MISSED [${m.engine}] ${m.ruleId}: ${m.message.slice(0, 90)}`);
      }
    }
    if (delta.severityDisagreements.length > 0) {
      for (const d of delta.severityDisagreements) {
        console.log(`    SEV-DIFF ${d.ruleId}: ours=${d.ourSeverity} axe=${d.axeSeverity}`);
      }
    }

    results.push({
      url,
      ourScanner: {
        issueCount: ourIssues.length,
        accessibilityIssueCount: a11yCount,
        extendedScopeCount: extCount,
        byCategory,
        bySeverity,
        issues: ourIssues,
      },
      standaloneAxe: {
        violationRuleCount: axeResult.ruleCount,
        issueCount: axeResult.issues.length,
        issues: axeResult.issues,
      },
      pa11y: {
        issueCount: pa11yResult.issues.length,
        issues: pa11yResult.issues,
        skipped: pa11yResult.skipped,
        skipReason: pa11yResult.skipReason,
      },
      delta,
    });
  }

  // ------ Summary ------
  const n = TEST_URLS.length;
  const avgOur = (totalOur / n).toFixed(1);
  const avgOurA11y = (totalOurA11y / n).toFixed(1);
  const avgAxe = (totalAxe / n).toFixed(1);
  const avgPa11y = (totalPa11y / n).toFixed(1);
  const avgMissed = (totalMissed / n).toFixed(1);
  const avgOver = (totalOver / n).toFixed(1);
  const a11yGap = (totalOurA11y - totalAxe) / n;

  console.log(
    `\nSUMMARY: across ${n} URLs:` +
      `\n  Our total issues: avg ${avgOur} (a11y-only: ${avgOurA11y})` +
      `\n  Axe standalone:   avg ${avgAxe} (per-node)` +
      `\n  Pa11y:            avg ${avgPa11y}` +
      `\n  A11y gap:         ${a11yGap >= 0 ? "+" : ""}${a11yGap.toFixed(1)} (positive = we flag more a11y issues than raw axe)` +
      `\n  Avg rules missed: ${avgMissed} (axe/pa11y flagged, we did not)` +
      `\n  Avg rules we added beyond axe: ${avgOver} (a11y scope only)`,
  );

  // ------ Write JSON report ------
  const report: Report = {
    ranAt: new Date().toISOString(),
    urls: results,
    summary: {
      totalUrls: n,
      totalOurIssues: totalOur,
      totalOurAccessibilityOnly: totalOurA11y,
      totalAxeStandalone: totalAxe,
      totalPa11y: totalPa11y,
      averageWeMissed: parseFloat(avgMissed),
      averageWeOverFlagged: parseFloat(avgOver),
    },
  };

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const reportPath = resolve(__dirname, "scanner-verify-report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to: ${reportPath}`);
}

main().catch((err) => {
  console.error("Harness failed:", err);
  process.exit(1);
});
