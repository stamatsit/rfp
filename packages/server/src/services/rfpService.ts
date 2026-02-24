/**
 * RFP Document Service
 * Extracts text and images from PDF, DOCX, and TXT files
 */

import crypto from "crypto"
import mammoth from "mammoth"
import { createRequire } from "module"

const require = createRequire(import.meta.url)
const { PDFParse } = require("pdf-parse")

const MAX_IMAGES = 50
const MAX_IMAGE_BYTES = 2 * 1024 * 1024 // 2MB per image

export interface ExtractedImage {
  dataUrl: string
  name: string
  width: number
  height: number
  pageNumber?: number
  contentType: string
  sizeBytes: number
}

export interface ExtractResult {
  text: string
  filename: string
  pageCount?: number
  images?: ExtractedImage[]
}

/**
 * Extract text and images from a document buffer
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

    // Extract images (deduplicated — logos etc. only appear once)
    let images: ExtractedImage[] = []
    const seenHashes = new Set<string>()
    try {
      const imgResult = await parser.getImage({
        imageBuffer: false,
        imageDataUrl: true,
        imageThreshold: 80,
      })

      for (const page of imgResult.pages) {
        for (const img of page.images) {
          if (images.length >= MAX_IMAGES) break
          const sizeBytes = Math.round((img.dataUrl.length - img.dataUrl.indexOf(",") - 1) * 0.75)
          if (sizeBytes > MAX_IMAGE_BYTES) continue

          // Deduplicate by content hash
          const hash = crypto.createHash("md5").update(img.dataUrl).digest("hex")
          if (seenHashes.has(hash)) continue
          seenHashes.add(hash)

          const contentType = img.dataUrl.match(/^data:(image\/[^;]+);/)?.[1] || "image/png"
          images.push({
            dataUrl: img.dataUrl,
            name: img.name || `page${page.pageNumber}-img${page.images.indexOf(img)}`,
            width: img.width,
            height: img.height,
            pageNumber: page.pageNumber,
            contentType,
            sizeBytes,
          })
        }
        if (images.length >= MAX_IMAGES) break
      }
    } catch (err) {
      console.warn("Image extraction failed for PDF, continuing with text only:", err)
    }

    parser.destroy()

    const text = textResult.pages.map((p: { text: string }) => p.text).join("\n\n")

    return {
      text,
      filename,
      pageCount: info.numPages,
      images: images.length > 0 ? images : undefined,
    }
  }

  // Word documents (DOCX)
  if (
    ext === "docx" ||
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const images: ExtractedImage[] = []
    const seenHashes = new Set<string>()
    let imgIndex = 0

    // Extract text + images via convertToHtml
    const htmlResult = await mammoth.convertToHtml(
      { buffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          if (images.length >= MAX_IMAGES) {
            return { src: "" }
          }
          try {
            const base64 = await image.readAsBase64String()
            const ct = image.contentType || "image/png"
            const dataUrl = `data:${ct};base64,${base64}`
            const sizeBytes = Math.round(base64.length * 0.75)

            // Deduplicate by content hash
            const hash = crypto.createHash("md5").update(base64).digest("hex")
            if (seenHashes.has(hash)) return { src: "" }
            seenHashes.add(hash)

            if (sizeBytes <= MAX_IMAGE_BYTES) {
              imgIndex++
              images.push({
                dataUrl,
                name: `image_${imgIndex}`,
                width: 0,
                height: 0,
                contentType: ct,
                sizeBytes,
              })
            }
          } catch (err) {
            console.warn(`Failed to extract DOCX image ${imgIndex}:`, err)
          }
          return { src: "" }
        }),
      }
    )

    // Strip HTML tags to get clean text
    const text = htmlResult.value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

    return {
      text,
      filename,
      images: images.length > 0 ? images : undefined,
    }
  }

  // Legacy Word documents (DOC) - mammoth can handle these too
  if (ext === "doc" || mimetype === "application/msword") {
    const images: ExtractedImage[] = []
    const seenHashes = new Set<string>()
    let imgIndex = 0

    const htmlResult = await mammoth.convertToHtml(
      { buffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          if (images.length >= MAX_IMAGES) {
            return { src: "" }
          }
          try {
            const base64 = await image.readAsBase64String()
            const ct = image.contentType || "image/png"
            const dataUrl = `data:${ct};base64,${base64}`
            const sizeBytes = Math.round(base64.length * 0.75)

            // Deduplicate by content hash
            const hash = crypto.createHash("md5").update(base64).digest("hex")
            if (seenHashes.has(hash)) return { src: "" }
            seenHashes.add(hash)

            if (sizeBytes <= MAX_IMAGE_BYTES) {
              imgIndex++
              images.push({
                dataUrl,
                name: `image_${imgIndex}`,
                width: 0,
                height: 0,
                contentType: ct,
                sizeBytes,
              })
            }
          } catch (err) {
            console.warn(`Failed to extract DOC image ${imgIndex}:`, err)
          }
          return { src: "" }
        }),
      }
    )

    const text = htmlResult.value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

    return {
      text,
      filename,
      images: images.length > 0 ? images : undefined,
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
