# In-Progress Work

Living index of features currently being designed, built, or recently shipped (but not yet committed/merged). Start here when picking up work mid-stream. Each entry links to a detailed doc with file paths, decisions, mockups, and what's left.

**Last updated:** 2026-05-13

---

## Active

### Webinars feature
Auto-categorize GoToWebinar registrants as Do Not Contact / Client / Employee / Non-Client by email domain. Archive forever. Filter and export. Stats over time. Manual upload only.

- **Status:** Mockups deployed and approved. Implementation not started.
- **Live demo:** [https://webinars-mockup-three.vercel.app](https://webinars-mockup-three.vercel.app) (Stamats Vercel team, fictional data)
- **Mockup source:** [mockups/webinars-*.html](../mockups/) (6 files including landing)
- **Detail doc:** [in-progress/webinars-feature.md](in-progress/webinars-feature.md)

### Active-clients source of truth + Do Not Contact list
Two columns on the existing `clients` table (`status`, `email_domains[]`) plus a new `do_not_contact` table make Client Portfolio the canonical answer to "is this email an active client?" and "should we contact this person?" across every feature in the app. DNC entries are hidden by default everywhere but easily revealed, and people move bi-directionally between Client / Non-Client / Do Not Contact. Prerequisite for Webinars phase 1.

- **Status:** Design decision locked. Migration and UI not written.
- **Detail doc:** [in-progress/active-clients-source-of-truth.md](in-progress/active-clients-source-of-truth.md)

---

## Recently shipped, not yet committed

### Client Portfolio — Add Asset menu
Admin-only dropdown on the Assets tab to add testimonials/case studies/awards/results without leaving the client's page. The client gets pre-filled automatically.

- **Status:** Built, type-clean, uncommitted. Not interactively verified yet.
- **Files touched:** `NewEntryPanel.tsx`, `ClientAssetsTab.tsx`, `ClientPortfolioContext.tsx`
- **Detail doc:** [in-progress/client-portfolio-add-asset-menu.md](in-progress/client-portfolio-add-asset-menu.md)

---

## How to use this file

- **Picking up work?** Read the relevant detail doc end-to-end before touching code. Each one has Decisions Locked In, Files Touched, What's Left, and Open Questions.
- **Finishing a feature?** Delete its entry here and from `in-progress/`. Move anything reusable into a permanent doc (`docs/<feature>.md`) or into code comments where the *why* is non-obvious.
- **Starting new work?** Add an entry. Even a 3-line stub is better than nothing — your future self / next developer / the next Claude session will thank you.
