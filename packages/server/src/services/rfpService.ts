/**
 * RFP Document Service
 * Extracts text from PDF, DOCX, and TXT files
 */

import mammoth from "mammoth"
import { createRequire } from "module"

const require = createRequire(import.meta.url)
const { PDFParse } = require("pdf-parse")

export interface ExtractResult {
  text: string
  filename: string
  pageCount?: number
}

/**
 * Extract text content from a document buffer
 */
export async function extractDocumentText(
  buffer: Buffer,
  mimetype: string,
  filename: string
): Promise<ExtractResult> {
  const ext = filename.toLowerCase().split(".").pop()

  // PDF files
  if (ext === "pdf" || mimetype === "application/pdf") {
    const parser = new PDFParse({ data: new Uint8Array(buffer), verbosity: 0 })
    await parser.load()
    const info = await parser.getInfo()
    const textResult = await parser.getText()
    parser.destroy()

    // Combine all page text
    const text = textResult.pages.map((p: { text: string }) => p.text).join("\n\n")

    return {
      text,
      filename,
      pageCount: info.numPages,
    }
  }

  // Word documents (DOCX)
  if (
    ext === "docx" ||
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer })
    return {
      text: result.value,
      filename,
    }
  }

  // Legacy Word documents (DOC) - mammoth can handle these too
  if (ext === "doc" || mimetype === "application/msword") {
    const result = await mammoth.extractRawText({ buffer })
    return {
      text: result.value,
      filename,
    }
  }

  // Plain text files
  if (ext === "txt" || mimetype === "text/plain") {
    return {
      text: buffer.toString("utf-8"),
      filename,
    }
  }

  // Fallback - try to decode as text
  return {
    text: buffer.toString("utf-8"),
    filename,
  }
}
