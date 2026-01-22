/**
 * Script to cleanup test data from the database
 * Run with: npx tsx scripts/cleanup-test-data.ts
 */

import "dotenv/config"
import { db, topics, answerItems, photoAssets } from "../src/db/index.js"
import { sql } from "drizzle-orm"

async function cleanup() {
  if (!db) {
    console.error("Database not available")
    process.exit(1)
  }

  console.log("Starting cleanup of test data...")

  // Test patterns to match
  const testPatterns = [
    "Test Topic",
    "Find Test",
    "Link Test",
    "Photo Test",
    "Upsert Test",
    "Answer Test",
    "test question",
    "Unique question",
    "Link test question",
    "Unlink test question",
    "Upsert question",
  ]

  // Build WHERE clause for topics
  const topicPattern = testPatterns.slice(0, 6).map(p => `display_name ILIKE '%${p}%'`).join(" OR ")

  // Build WHERE clause for answers
  const answerPattern = testPatterns.map(p => `question ILIKE '%${p}%'`).join(" OR ")

  try {
    // Delete test answers first (due to FK constraints)
    console.log("\nDeleting test answers...")
    const answerResult = await db.execute(sql.raw(`
      DELETE FROM answer_items
      WHERE ${answerPattern}
      RETURNING id
    `))
    console.log(`  Deleted ${(answerResult as unknown[]).length} test answers`)

    // Delete test photos
    console.log("\nDeleting test photos...")
    const photoResult = await db.execute(sql.raw(`
      DELETE FROM photo_assets
      WHERE display_title ILIKE '%test%'
        AND (display_title ILIKE '%Photo Test Topic%' OR display_title ILIKE '%test photo%')
      RETURNING id
    `))
    console.log(`  Deleted ${(photoResult as unknown[]).length} test photos`)

    // Get or create the "General" topic to reassign orphaned photos
    console.log("\nFinding or creating 'General' topic for orphaned items...")
    let generalTopic = await db.execute(sql.raw(`
      SELECT id FROM topics WHERE name = 'general' LIMIT 1
    `))
    let generalTopicId: string
    if ((generalTopic as unknown[]).length === 0) {
      const newTopic = await db.execute(sql.raw(`
        INSERT INTO topics (name, display_name) VALUES ('general', 'General')
        RETURNING id
      `))
      generalTopicId = (newTopic as unknown as Array<{ id: string }>)[0]?.id ?? ""
      console.log(`  Created 'General' topic`)
    } else {
      generalTopicId = (generalTopic as unknown as Array<{ id: string }>)[0]?.id ?? ""
      console.log(`  Using existing 'General' topic`)
    }

    // Reassign photos from test topics to General
    console.log("\nReassigning photos from test topics to 'General'...")
    const reassignResult = await db.execute(sql.raw(`
      UPDATE photo_assets
      SET topic_id = '${generalTopicId}'
      WHERE topic_id IN (
        SELECT id FROM topics WHERE ${topicPattern}
      )
      RETURNING id
    `))
    console.log(`  Reassigned ${(reassignResult as unknown[]).length} photos`)

    // Delete test topics
    console.log("\nDeleting test topics...")
    const topicResult = await db.execute(sql.raw(`
      DELETE FROM topics
      WHERE ${topicPattern}
      RETURNING id
    `))
    console.log(`  Deleted ${(topicResult as unknown[]).length} test topics`)

    console.log("\n✓ Cleanup complete!")

    // Show remaining counts
    const remainingTopics = await db.select({ count: sql<number>`count(*)` }).from(topics)
    const remainingAnswers = await db.select({ count: sql<number>`count(*)` }).from(answerItems)
    const remainingPhotos = await db.select({ count: sql<number>`count(*)` }).from(photoAssets)

    console.log("\nRemaining data:")
    console.log(`  Topics: ${remainingTopics[0]?.count ?? 0}`)
    console.log(`  Answers: ${remainingAnswers[0]?.count ?? 0}`)
    console.log(`  Photos: ${remainingPhotos[0]?.count ?? 0}`)

  } catch (error) {
    console.error("Cleanup failed:", error)
    process.exit(1)
  }

  process.exit(0)
}

cleanup()
