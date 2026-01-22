import { eq } from "drizzle-orm"
import { db, topics, type Topic, type NewTopic } from "../db/index.js"
import { normalizeTopicName } from "../lib/utils.js"

/**
 * Get all topics ordered by display name
 */
export async function getAllTopics(): Promise<Topic[]> {
  if (!db) throw new Error("Database not available")

  return db.select().from(topics).orderBy(topics.displayName)
}

/**
 * Get a topic by ID
 */
export async function getTopicById(id: string): Promise<Topic | undefined> {
  if (!db) throw new Error("Database not available")

  const result = await db.select().from(topics).where(eq(topics.id, id)).limit(1)
  return result[0]
}

/**
 * Get a topic by normalized name
 */
export async function getTopicByName(name: string): Promise<Topic | undefined> {
  if (!db) throw new Error("Database not available")

  const normalizedName = normalizeTopicName(name)
  const result = await db
    .select()
    .from(topics)
    .where(eq(topics.name, normalizedName))
    .limit(1)

  return result[0]
}

/**
 * Create a new topic
 */
export async function createTopic(displayName: string): Promise<Topic> {
  if (!db) throw new Error("Database not available")

  const normalizedName = normalizeTopicName(displayName)

  const newTopic: NewTopic = {
    name: normalizedName,
    displayName: displayName.trim(),
  }

  const result = await db.insert(topics).values(newTopic).returning()

  if (!result[0]) {
    throw new Error("Failed to create topic")
  }

  return result[0]
}

/**
 * Upsert a topic - create if doesn't exist, return existing if it does
 * This is the main function used during import
 */
export async function upsertTopic(displayName: string): Promise<Topic> {
  if (!db) throw new Error("Database not available")

  // Check if topic exists
  const existing = await getTopicByName(displayName)

  if (existing) {
    return existing
  }

  // Create new topic
  return createTopic(displayName)
}

/**
 * Upsert multiple topics at once (for batch import)
 * Returns a map of normalized name -> Topic
 */
export async function upsertTopics(displayNames: string[]): Promise<Map<string, Topic>> {
  if (!db) throw new Error("Database not available")

  const result = new Map<string, Topic>()

  // Deduplicate input
  const uniqueNames = [...new Set(displayNames.map((n) => n.trim()).filter(Boolean))]

  for (const displayName of uniqueNames) {
    const topic = await upsertTopic(displayName)
    result.set(normalizeTopicName(displayName), topic)
  }

  return result
}

/**
 * Get topics map by IDs
 */
export async function getTopicsMap(ids: string[]): Promise<Map<string, Topic>> {
  if (!db) throw new Error("Database not available")

  const allTopics = await getAllTopics()
  const result = new Map<string, Topic>()

  for (const topic of allTopics) {
    if (ids.includes(topic.id)) {
      result.set(topic.id, topic)
    }
  }

  return result
}

/**
 * Delete a topic by ID
 * Note: This will cascade delete related answers and photos due to FK constraints
 */
export async function deleteTopic(id: string): Promise<void> {
  if (!db) throw new Error("Database not available")

  await db.delete(topics).where(eq(topics.id, id))
}

/**
 * Delete multiple topics by ID pattern matching on displayName
 */
export async function deleteTopicsByPattern(pattern: RegExp): Promise<number> {
  if (!db) throw new Error("Database not available")

  const allTopics = await getAllTopics()
  const toDelete = allTopics.filter((t) => pattern.test(t.displayName))

  for (const topic of toDelete) {
    await db.delete(topics).where(eq(topics.id, topic.id))
  }

  return toDelete.length
}
