/**
 * Script to import Loopio library entries from .docx export
 * Run with: npx tsx src/scripts/importLoopio.ts
 */

import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import mammoth from "mammoth"
import { config } from "dotenv"

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from server package root BEFORE importing db
const envPath = path.resolve(__dirname, "..", "..", ".env")
console.log(`Loading env from: ${envPath}`)
const envResult = config({ path: envPath })
console.log(`Env loaded:`, envResult.parsed ? "yes" : "no")
console.log(`DATABASE_URL set:`, !!process.env.DATABASE_URL)

// Dynamic imports after env is loaded
const { upsertTopic } = await import("../services/topicService.js")
const { upsertAnswer } = await import("../services/answerService.js")
const { initializeDatabase } = await import("../db/index.js")

interface LoopioEntry {
  id: string
  title: string
  stack?: string
  category: string
  subCategory?: string
  tags: string[]
  alert?: string
  alternateQuestions: string[]
  content: string
  libraryUrl?: string
}

/**
 * Parse raw text from Loopio document into structured entries
 */
function parseLoopioText(text: string): LoopioEntry[] {
  const entries: LoopioEntry[] = []

  // Split by "ID: " to get individual entries
  const rawEntries = text.split(/(?=ID:\s*\d+)/).filter(e => e.trim())

  for (const rawEntry of rawEntries) {
    const lines = rawEntry.split("\n").map(l => l.trim()).filter(l => l)

    if (lines.length < 2) continue

    // Extract ID
    const firstLine = lines[0]
    if (!firstLine) continue
    const idMatch = firstLine.match(/ID:\s*(\d+)/)
    if (!idMatch?.[1]) continue

    const entry: LoopioEntry = {
      id: idMatch[1],
      title: "",
      category: "Education", // Default, will be overwritten if found
      tags: [],
      alternateQuestions: [],
      content: "",
    }

    let inContent = false
    const contentLines: string[] = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue

      // Check for metadata fields
      if (line.startsWith("Stack:")) {
        entry.stack = line.replace("Stack:", "").trim()
        continue
      }
      if (line.startsWith("Category:")) {
        entry.category = line.replace("Category:", "").trim()
        continue
      }
      if (line.startsWith("Sub Category:")) {
        entry.subCategory = line.replace("Sub Category:", "").trim()
        continue
      }
      if (line.startsWith("Tags:")) {
        const tagsStr = line.replace("Tags:", "").trim()
        entry.tags = tagsStr.split(",").map(t => t.trim()).filter(t => t)
        continue
      }
      if (line.startsWith("Alert:")) {
        entry.alert = line.replace("Alert:", "").trim()
        continue
      }
      if (line.startsWith("Library Entry URL:")) {
        entry.libraryUrl = line.replace("Library Entry URL:", "").trim()
        continue
      }
      if (line.match(/^Alternate Question \(\d+\):/)) {
        const altQ = line.replace(/^Alternate Question \(\d+\):/, "").trim()
        if (altQ) entry.alternateQuestions.push(altQ)
        continue
      }

      // If we haven't set the title yet and this isn't a metadata line
      if (!entry.title && !inContent) {
        entry.title = line
        inContent = true
        continue
      }

      // Everything else is content
      if (inContent) {
        contentLines.push(line)
      }
    }

    entry.content = contentLines.join("\n\n").trim()

    // Only add entries with meaningful content
    if (entry.title && entry.content) {
      entries.push(entry)
    }
  }

  return entries
}

/**
 * Main import function
 */
async function importLoopioDocument(filePath: string) {
  console.log(`Reading Loopio document: ${filePath}`)

  // Read the docx file
  const buffer = fs.readFileSync(filePath)
  const result = await mammoth.extractRawText({ buffer })
  const text = result.value

  console.log(`Extracted ${text.length} characters of text`)

  // Parse entries
  const entries = parseLoopioText(text)
  console.log(`Parsed ${entries.length} Loopio entries`)

  // Initialize database
  console.log("Connecting to database...")
  const dbReady = await initializeDatabase()
  if (!dbReady) {
    console.error("Failed to connect to database. Check your .env file.")
    process.exit(1)
  }

  // Import each entry
  let imported = 0
  let updated = 0
  let skipped = 0
  const errors: string[] = []

  for (const entry of entries) {
    try {
      // Create/get topic
      const topic = await upsertTopic(entry.category)

      // Import main entry
      const result = await upsertAnswer({
        question: entry.title,
        answer: entry.content,
        topicId: topic.id,
        topicName: topic.displayName,
        subtopic: entry.subCategory,
        tags: entry.tags,
      }, 0)

      if (result.isNew) {
        imported++
        console.log(`✓ Imported: ${entry.title.slice(0, 50)}...`)
      } else {
        updated++
        console.log(`↻ Updated: ${entry.title.slice(0, 50)}...`)
      }

      // Import alternate questions as separate entries pointing to same answer
      // (They share the same content but have different question phrasings)
      for (const altQ of entry.alternateQuestions) {
        try {
          const altResult = await upsertAnswer({
            question: altQ,
            answer: entry.content,
            topicId: topic.id,
            topicName: topic.displayName,
            subtopic: entry.subCategory,
            tags: entry.tags,
          }, 0)

          if (altResult.isNew) {
            imported++
          } else {
            updated++
          }
        } catch (err) {
          // Alternate questions may fail due to duplicates, that's ok
        }
      }

    } catch (error) {
      skipped++
      const errMsg = `Failed to import "${entry.title}": ${error instanceof Error ? error.message : "Unknown error"}`
      errors.push(errMsg)
      console.error(`✗ ${errMsg}`)
    }
  }

  console.log("\n=== Import Complete ===")
  console.log(`Imported: ${imported}`)
  console.log(`Updated: ${updated}`)
  console.log(`Skipped: ${skipped}`)

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`)
    errors.forEach(e => console.log(`  - ${e}`))
  }
}

// Run the import
const docPath = path.resolve(process.cwd(), "..", "..", "loopio.docx")
importLoopioDocument(docPath)
  .then(() => {
    console.log("\nDone!")
    process.exit(0)
  })
  .catch((err) => {
    console.error("Import failed:", err)
    process.exit(1)
  })
