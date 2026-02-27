import { test, expect, type Page } from "@playwright/test"

// ── Auth helper ───────────────────────────────────────────────────────────────
// Logs in if the current URL contains "/login". Reusable across all describe
// blocks so every test starts from an authenticated session.
async function loginIfNeeded(page: Page) {
  if (page.url().includes("/login")) {
    await page.fill('input[type="email"]', "eric.yerke@stamats.com")
    await page.fill('input[type="password"]', "St@mats")
    await page.click('button[type="submit"]')
    // Wait until we leave the login page
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 })
  }
}

// Navigate to /studio and handle any login redirect along the way.
async function gotoStudio(page: Page) {
  await page.goto("/studio")
  await loginIfNeeded(page)
  // After auth, the app may redirect to "/" — navigate again if needed.
  if (!page.url().includes("/studio")) {
    await page.goto("/studio")
  }
  // Wait for the toolbar title input which is always present once the page mounts.
  await page.waitForSelector('input[placeholder="Untitled"]', { timeout: 15000 })
}

// ── 1. Navigation and Layout ──────────────────────────────────────────────────
test.describe("Document Studio - Navigation and Layout", () => {
  test.beforeEach(async ({ page }) => {
    await gotoStudio(page)
  })

  test("should navigate to /studio and show the studio page", async ({ page }) => {
    await expect(page).toHaveURL(/\/studio/)
    // The page title heading rendered by AppHeader
    await expect(page.getByText("Document Studio")).toBeVisible()
  })

  test("should show the empty state with start options when no document is loaded", async ({ page }) => {
    // The empty state renders when documentId is null and content is empty.
    // It presents three start options.
    await expect(page.getByText("Blank")).toBeVisible()
    await expect(page.getByText("Template")).toBeVisible()
    await expect(page.getByText("Import")).toBeVisible()
  })

  test("should show the AI chat sidebar with suggestion chips", async ({ page }) => {
    // The sidebar header shows "AI Assistant" when in editor mode.
    await expect(page.getByText("AI Assistant")).toBeVisible()

    // The four suggestion chip prompts should be visible in the empty state.
    await expect(page.getByText("Write an executive summary")).toBeVisible()
    await expect(page.getByText("Draft a proposal response")).toBeVisible()
    await expect(page.getByText("Create a case study overview")).toBeVisible()
    await expect(page.getByText("Build a timeline table")).toBeVisible()
  })

  test("should show the title input in the toolbar", async ({ page }) => {
    const titleInput = page.locator('input[placeholder="Untitled"]')
    await expect(titleInput).toBeVisible()
  })

  test("should show save status indicator in the toolbar", async ({ page }) => {
    // On initial load with no document the save status is "unsaved" or "saved".
    // Either way, the save status container is present.
    const toolbar = page.locator(
      'div.bg-white\\/90, div.bg-amber-50\\/80'
    ).first()
    await expect(toolbar).toBeVisible()
  })
})

// ── 2. Editor ─────────────────────────────────────────────────────────────────
test.describe("Document Studio - Editor", () => {
  test.beforeEach(async ({ page }) => {
    await gotoStudio(page)
  })

  test("should open the editor canvas when clicking Blank", async ({ page }) => {
    await page.getByText("Blank").click()
    // After clicking Blank the editor canvas renders with the .tiptap-editor class.
    await expect(page.locator(".tiptap-editor").first()).toBeVisible()
  })

  test("should allow typing text into the editor", async ({ page }) => {
    await page.getByText("Blank").click()
    // ProseMirror is the contenteditable element produced by TipTap.
    const proseMirror = page.locator(".ProseMirror").first()
    await expect(proseMirror).toBeVisible()
    await proseMirror.click()
    await page.keyboard.type("Hello from Playwright")
    await expect(proseMirror).toContainText("Hello from Playwright")
  })

  test("should update the document title when the title input is changed", async ({ page }) => {
    const titleInput = page.locator('input[placeholder="Untitled"]')
    await titleInput.fill("My Test Document")
    // Click away to trigger onBlur/onChange propagation.
    await page.keyboard.press("Enter")
    await expect(titleInput).toHaveValue("My Test Document")
  })

  test("should show Unsaved status after typing into the editor", async ({ page }) => {
    await page.getByText("Blank").click()
    const proseMirror = page.locator(".ProseMirror").first()
    await proseMirror.click()
    await page.keyboard.type("Triggering unsaved state")
    // The toolbar displays "Unsaved" text when isDirty is true.
    await expect(page.getByText("Unsaved")).toBeVisible()
  })

  test("should open the inspector panel when the panel toggle button is clicked", async ({ page }) => {
    // The inspector toggle button has title "Toggle inspector (format, outline, checklist)".
    const inspectorToggle = page.locator('button[title="Toggle inspector (format, outline, checklist)"]')
    await expect(inspectorToggle).toBeVisible()
    await inspectorToggle.click()
    // Once open the Inspector panel renders with the "Inspector" label.
    await expect(page.getByText("Inspector")).toBeVisible()
    // Format tab is the default active tab.
    await expect(page.getByRole("button", { name: "Format" })).toBeVisible()
  })
})

// ── 3. Inspector Panel ────────────────────────────────────────────────────────
test.describe("Document Studio - Inspector Panel", () => {
  test.beforeEach(async ({ page }) => {
    await gotoStudio(page)
    // Open the inspector panel before each test in this describe block.
    const inspectorToggle = page.locator('button[title="Toggle inspector (format, outline, checklist)"]')
    await inspectorToggle.click()
    await expect(page.getByText("Inspector")).toBeVisible()
  })

  test("should show the Format tab with typography settings by default", async ({ page }) => {
    // Format tab is active by default after opening the inspector.
    await expect(page.getByRole("button", { name: "Format" })).toBeVisible()
    // Typography section label
    await expect(page.getByText("Typography")).toBeVisible()
    // Font label
    await expect(page.getByText("Font").first()).toBeVisible()
    // Size label
    await expect(page.getByText("Size").first()).toBeVisible()
  })

  test("should show font size stepper buttons that are clickable", async ({ page }) => {
    // The format tab has Minus (-) and Plus (+) stepper buttons for font size.
    // They are button elements containing SVG icons with no accessible text,
    // so we locate them via their title-less sibling context inside the size row.
    // The Minus button is the first sibling, Plus is the last.
    const sizeSection = page.locator("div").filter({ hasText: /^Size$/ }).first()

    // The stepper row is the next sibling div containing the two icon buttons.
    // We can target them by their position relative to the font size select.
    const fontSizeSelect = page.locator('select').filter({ hasText: /px/ }).first()
    await expect(fontSizeSelect).toBeVisible()

    // Minus button (decrements font size) — the button immediately before the select.
    const minusButton = page.locator('button').filter({ has: page.locator('svg') }).nth(0)

    // We verify both stepper buttons are present within the inspector region.
    // The inspector panel wraps in a 276px div with class animate-inspector-in.
    const inspector = page.locator(".animate-inspector-in")
    await expect(inspector).toBeVisible()

    // Locate the two step buttons inside the inspector's size control.
    // They are rendered as w-7 h-7 buttons with Minus/Plus icons.
    const stepButtons = inspector.locator('button').filter({ has: page.locator('svg') })
    // There are multiple buttons in the inspector; locate the ones adjacent to the
    // font size select by finding the row that contains it.
    const fontSizeRow = inspector.locator("div").filter({
      has: fontSizeSelect,
    }).first()
    await expect(fontSizeRow).toBeVisible()

    const decrementBtn = fontSizeRow.locator("button").first()
    const incrementBtn = fontSizeRow.locator("button").last()
    await expect(decrementBtn).toBeVisible()
    await expect(incrementBtn).toBeVisible()

    // Both buttons should be clickable without throwing.
    await incrementBtn.click()
    await decrementBtn.click()
  })

  test("should switch to the Outline tab when clicked", async ({ page }) => {
    await page.getByRole("button", { name: "Outline" }).click()
    // With no content in the editor the outline shows the empty state message.
    await expect(
      page.getByText("No headings yet.")
    ).toBeVisible()
  })

  test("should show 'No headings yet' message on the Outline tab when document is empty", async ({ page }) => {
    await page.getByRole("button", { name: "Outline" }).click()
    await expect(
      page.getByText(/No headings yet/)
    ).toBeVisible()
    await expect(
      page.getByText(/Add headings to see your document outline/)
    ).toBeVisible()
  })

  test("should switch to the Checklist tab when clicked", async ({ page }) => {
    await page.getByRole("button", { name: "Checklist" }).click()
    // Without an RFP document uploaded, the checklist shows a prompt to upload one.
    await expect(
      page.getByText(/Upload an RFP document in the chat sidebar/)
    ).toBeVisible()
  })

  test("should show 'Upload an RFP document' message on the Checklist tab when no RFP is loaded", async ({ page }) => {
    await page.getByRole("button", { name: "Checklist" }).click()
    await expect(
      page.getByText(/Upload an RFP document in the chat sidebar to enable compliance checking/)
    ).toBeVisible()
  })

  test("should close the inspector panel when the close button is clicked", async ({ page }) => {
    // The close button inside the inspector has title "Close inspector".
    const closeBtn = page.locator('button[title="Close inspector"]')
    await expect(closeBtn).toBeVisible()
    await closeBtn.click()
    // After closing the Inspector label should no longer be visible.
    await expect(page.getByText("Inspector")).not.toBeVisible()
  })
})

// ── 4. Export Dialog ──────────────────────────────────────────────────────────
test.describe("Document Studio - Export Dialog", () => {
  test.beforeEach(async ({ page }) => {
    await gotoStudio(page)
  })

  test("should open the export dialog when the Export button is clicked", async ({ page }) => {
    // The Export button is always present in the toolbar.
    const exportBtn = page.getByRole("button", { name: /Export/i }).first()
    await expect(exportBtn).toBeVisible()
    await exportBtn.click()
    // The dialog renders a modal with "Export Document" header.
    await expect(page.getByText("Export Document")).toBeVisible()
  })

  test("should show PDF, Word, and Copy Text format options in the export dialog", async ({ page }) => {
    const exportBtn = page.getByRole("button", { name: /Export/i }).first()
    await exportBtn.click()
    await expect(page.getByText("Export Document")).toBeVisible()

    // The three format buttons render with label text.
    await expect(page.getByText("PDF")).toBeVisible()
    await expect(page.getByText("Word")).toBeVisible()
    await expect(page.getByText("Copy Text")).toBeVisible()
  })

  test("should show a filename input in the export dialog", async ({ page }) => {
    const exportBtn = page.getByRole("button", { name: /Export/i }).first()
    await exportBtn.click()
    await expect(page.getByText("Export Document")).toBeVisible()

    // Filename input is present (visible when format is PDF or Word, not clipboard).
    const filenameInput = page.locator('input[placeholder="document"]')
    await expect(filenameInput).toBeVisible()
  })

  test("should allow selecting the Word format option", async ({ page }) => {
    const exportBtn = page.getByRole("button", { name: /Export/i }).first()
    await exportBtn.click()
    await expect(page.getByText("Export Document")).toBeVisible()

    // Click the Word option button.
    const wordBtn = page.locator("button").filter({ hasText: "Word" })
    await wordBtn.click()
    // After selecting, the export action button text changes to "Export DOCX".
    await expect(page.getByRole("button", { name: /Export DOCX/i })).toBeVisible()
  })

  test("should allow selecting the Copy Text format option", async ({ page }) => {
    const exportBtn = page.getByRole("button", { name: /Export/i }).first()
    await exportBtn.click()
    await expect(page.getByText("Export Document")).toBeVisible()

    const copyTextBtn = page.locator("button").filter({ hasText: "Copy Text" })
    await copyTextBtn.click()
    // When clipboard format is selected the action button says "Copy to Clipboard".
    await expect(page.getByRole("button", { name: /Copy to Clipboard/i })).toBeVisible()
  })

  test("should close the export dialog when Cancel is clicked", async ({ page }) => {
    const exportBtn = page.getByRole("button", { name: /Export/i }).first()
    await exportBtn.click()
    await expect(page.getByText("Export Document")).toBeVisible()

    await page.getByRole("button", { name: "Cancel" }).click()
    // The modal should no longer be in the DOM.
    await expect(page.getByText("Export Document")).not.toBeVisible()
  })
})

// ── 5. AI Sidebar ─────────────────────────────────────────────────────────────
test.describe("Document Studio - AI Sidebar", () => {
  test.beforeEach(async ({ page }) => {
    await gotoStudio(page)
  })

  test("should show suggestion chips when the sidebar is in the empty state", async ({ page }) => {
    // All four chips should be visible before any message is sent.
    await expect(page.getByText("Write an executive summary")).toBeVisible()
    await expect(page.getByText("Draft a proposal response")).toBeVisible()
    await expect(page.getByText("Create a case study overview")).toBeVisible()
    await expect(page.getByText("Build a timeline table")).toBeVisible()
  })

  test("should show the chat input textarea with the correct placeholder", async ({ page }) => {
    const textarea = page.locator('textarea[placeholder="Ask AI anything..."]')
    await expect(textarea).toBeVisible()
  })

  test("should accept text typed into the chat input textarea", async ({ page }) => {
    const textarea = page.locator('textarea[placeholder="Ask AI anything..."]')
    await textarea.click()
    await textarea.fill("How do I write a proposal?")
    await expect(textarea).toHaveValue("How do I write a proposal?")
  })

  test("should enable the send button when text is entered in the chat input", async ({ page }) => {
    const textarea = page.locator('textarea[placeholder="Ask AI anything..."]')
    await textarea.click()

    // Before typing, the send button is disabled (opacity-25 / aria-disabled).
    // After typing it becomes enabled. We verify it is no longer disabled.
    await textarea.fill("Test message")

    // The send button is the last button in the input row (not the paperclip).
    // It uses a gradient background when enabled.
    const sendBtn = page.locator("button").filter({
      has: page.locator('svg'), // Send icon
    }).last()

    await expect(sendBtn).not.toBeDisabled()
  })

  test("should show the paperclip file attachment button in the chat input area", async ({ page }) => {
    // The paperclip button has title "Attach file".
    const attachBtn = page.locator('button[title="Attach file"]')
    await expect(attachBtn).toBeVisible()
  })

  test("should show the AI sidebar header with the AI Assistant label", async ({ page }) => {
    await expect(page.getByText("AI Assistant")).toBeVisible()
  })

  test("should show an empty conversations state message", async ({ page }) => {
    // The empty state helper text prompts the user to draft/edit.
    await expect(
      page.getByText(/Ask me to help draft, edit, or improve your document/)
    ).toBeVisible()
  })
})

// ── 6. Review Mode ────────────────────────────────────────────────────────────
test.describe("Document Studio - Review Mode", () => {
  test.beforeEach(async ({ page }) => {
    await gotoStudio(page)
  })

  test("should show a Review button in the toolbar when in editor mode", async ({ page }) => {
    // The review toggle shows "Review" text when in editor mode.
    await expect(page.getByRole("button", { name: /Review/i }).first()).toBeVisible()
  })

  test("should switch to review mode when the Review button is clicked", async ({ page }) => {
    const reviewBtn = page.getByRole("button", { name: /^Review$/i })
    await reviewBtn.click()
    // After switching, the button text changes to "Reviewing".
    await expect(page.getByRole("button", { name: /Reviewing/i })).toBeVisible()
  })

  test("should show a review mode banner after enabling review mode", async ({ page }) => {
    const reviewBtn = page.getByRole("button", { name: /^Review$/i })
    await reviewBtn.click()
    // The amber banner appears in the document area.
    await expect(
      page.getByText(/Review Mode — AI will analyze and annotate your document/)
    ).toBeVisible()
  })

  test("should change the AI sidebar header to 'AI Review' in review mode", async ({ page }) => {
    const reviewBtn = page.getByRole("button", { name: /^Review$/i })
    await reviewBtn.click()
    await expect(page.getByText("AI Review")).toBeVisible()
  })

  test("should change the chat input placeholder to 'Ask for a review...' in review mode", async ({ page }) => {
    const reviewBtn = page.getByRole("button", { name: /^Review$/i })
    await reviewBtn.click()
    const textarea = page.locator('textarea[placeholder="Ask for a review..."]')
    await expect(textarea).toBeVisible()
  })

  test("should switch back to editor mode when Reviewing button is clicked again", async ({ page }) => {
    // Enter review mode.
    await page.getByRole("button", { name: /^Review$/i }).click()
    await expect(page.getByRole("button", { name: /Reviewing/i })).toBeVisible()

    // Exit review mode.
    await page.getByRole("button", { name: /Reviewing/i }).click()
    await expect(page.getByRole("button", { name: /^Review$/i })).toBeVisible()
    // The amber banner should be gone.
    await expect(
      page.getByText(/Review Mode — AI will analyze and annotate your document/)
    ).not.toBeVisible()
  })

  test("should show Exit Review link in the review mode banner", async ({ page }) => {
    const reviewBtn = page.getByRole("button", { name: /^Review$/i })
    await reviewBtn.click()
    await expect(page.getByText("Exit Review")).toBeVisible()
  })

  test("should exit review mode when Exit Review link is clicked", async ({ page }) => {
    await page.getByRole("button", { name: /^Review$/i }).click()
    await expect(page.getByText("Exit Review")).toBeVisible()
    await page.getByText("Exit Review").click()
    // Back to editor mode — the banner should disappear.
    await expect(
      page.getByText(/Review Mode — AI will analyze and annotate your document/)
    ).not.toBeVisible()
    await expect(page.getByRole("button", { name: /^Review$/i })).toBeVisible()
  })
})
