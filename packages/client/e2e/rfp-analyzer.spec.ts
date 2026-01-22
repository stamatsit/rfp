import { test, expect } from "@playwright/test"
import path from "path"

test.describe("RFP Analyzer", () => {
  test("should show upload zone initially", async ({ page }) => {
    await page.goto("/analyze")

    // Should show the upload zone with proper text
    await expect(page.getByText("Drop your RFP document here")).toBeVisible()
    await expect(page.getByRole("button", { name: /Choose File/i })).toBeVisible()

    // Should show supported formats
    await expect(page.getByText(/Supports PDF, Word/i)).toBeVisible()
  })

  test("should upload and display text file content", async ({ page }) => {
    await page.goto("/analyze")

    // Upload test file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, "fixtures/sample-rfp.txt"))

    // Wait for document viewer to appear
    await expect(page.getByTestId("document-viewer")).toBeVisible()

    // Should show filename in header
    await expect(page.getByText("sample-rfp.txt")).toBeVisible()

    // Should show document content
    await expect(page.getByText("REQUEST FOR PROPOSAL")).toBeVisible()
    await expect(page.getByText("Marketing Services for Higher Education")).toBeVisible()

    // Should show word count
    await expect(page.getByText(/words/i)).toBeVisible()
  })

  test("should show toolbar on text selection", async ({ page }) => {
    await page.goto("/analyze")

    // Upload test file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, "fixtures/sample-rfp.txt"))

    // Wait for document viewer
    await expect(page.getByTestId("document-viewer")).toBeVisible()

    // Select some text by triple-clicking on a paragraph
    const viewer = page.getByTestId("document-viewer")
    const textContent = viewer.locator("pre")

    // Use keyboard selection: click then shift+end to select text
    await textContent.click()

    // Select text using the keyboard
    await page.keyboard.down("Shift")
    await page.keyboard.press("End")
    await page.keyboard.up("Shift")

    // Toolbar should appear with action buttons
    await expect(page.getByTestId("selection-toolbar")).toBeVisible()
    await expect(page.getByRole("button", { name: /Find Matches/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /Ask AI/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /Add to Library/i })).toBeVisible()
  })

  test("should show instructions overlay when no selection", async ({ page }) => {
    await page.goto("/analyze")

    // Upload test file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, "fixtures/sample-rfp.txt"))

    // Wait for document viewer
    await expect(page.getByTestId("document-viewer")).toBeVisible()

    // Should show instructions
    await expect(page.getByText(/Select text to find matches/i)).toBeVisible()
  })

  test("should allow uploading a new document", async ({ page }) => {
    await page.goto("/analyze")

    // Upload test file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, "fixtures/sample-rfp.txt"))

    // Wait for document viewer
    await expect(page.getByTestId("document-viewer")).toBeVisible()

    // Click "Upload New" button
    await page.getByRole("button", { name: /Upload New/i }).click()

    // Should return to upload zone
    await expect(page.getByText("Drop your RFP document here")).toBeVisible()
  })

  test("should navigate to add entry on Add to Library click", async ({ page }) => {
    await page.goto("/analyze")

    // Upload test file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, "fixtures/sample-rfp.txt"))

    // Wait for document viewer
    await expect(page.getByTestId("document-viewer")).toBeVisible()

    // Select some text
    const viewer = page.getByTestId("document-viewer")
    const textContent = viewer.locator("pre")
    await textContent.click()
    await page.keyboard.down("Shift")
    await page.keyboard.press("End")
    await page.keyboard.up("Shift")

    // Wait for toolbar
    await expect(page.getByTestId("selection-toolbar")).toBeVisible()

    // Click Add to Library
    await page.getByRole("button", { name: /Add to Library/i }).click()

    // Should navigate to /new with question parameter
    await expect(page).toHaveURL(/\/new\?question=/)
  })
})
