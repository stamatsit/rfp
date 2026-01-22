import { describe, it, expect, beforeAll } from "vitest"
import "dotenv/config"

// Import services
import { getAllTopics, upsertTopic, getTopicByName } from "../services/topicService"
import {
  createAnswer,
  getAnswerByFingerprint,
  upsertAnswer,
  getAnswerVersions,
} from "../services/answerService"
import { createPhoto, renamePhoto, getPhotoVersions } from "../services/photoService"
import { linkAnswerToPhoto, getLinkedPhotos, getLinkedAnswers, unlinkAnswerFromPhoto } from "../services/linkService"
import { generateFingerprint, normalizeTopicName, normalizeTags } from "../lib/utils"

describe("Utility Functions", () => {
  it("should normalize topic names", () => {
    expect(normalizeTopicName("Website Design & Creative")).toBe("website-design-creative")
    expect(normalizeTopicName("  Content Marketing  ")).toBe("content-marketing")
    expect(normalizeTopicName("UPPERCASE TEST")).toBe("uppercase-test")
  })

  it("should normalize tags", () => {
    expect(normalizeTags(["Tag1", "TAG2", "  tag3  "])).toEqual(["tag1", "tag2", "tag3"])
    expect(normalizeTags(["dup", "DUP", "dup"])).toEqual(["dup"])
    expect(normalizeTags(["", "valid", "  "])).toEqual(["valid"])
  })

  it("should generate deterministic fingerprints", () => {
    const fp1 = generateFingerprint("What is your approach?", "Design")
    const fp2 = generateFingerprint("What is your approach?", "Design")
    const fp3 = generateFingerprint("What is your approach?", "Marketing")

    expect(fp1).toBe(fp2) // Same inputs = same fingerprint
    expect(fp1).not.toBe(fp3) // Different topic = different fingerprint
    expect(fp1).toHaveLength(16) // Should be 16 chars
  })
})

describe("Topic Service", () => {
  it("should create and retrieve topics", async () => {
    const topic = await upsertTopic("Test Topic " + Date.now())
    expect(topic).toBeDefined()
    expect(topic.id).toBeDefined()
    expect(topic.displayName).toContain("Test Topic")
  })

  it("should return existing topic on upsert", async () => {
    const displayName = "Upsert Test " + Date.now()
    const topic1 = await upsertTopic(displayName)
    const topic2 = await upsertTopic(displayName)

    expect(topic1.id).toBe(topic2.id)
  })

  it("should find topic by name", async () => {
    const displayName = "Find Test " + Date.now()
    const created = await upsertTopic(displayName)
    const found = await getTopicByName(displayName)

    expect(found).toBeDefined()
    expect(found?.id).toBe(created.id)
  })

  it("should list all topics", async () => {
    const topics = await getAllTopics()
    expect(Array.isArray(topics)).toBe(true)
  })
})

describe("Answer Service", () => {
  let testTopicId: string
  let testTopicName: string

  beforeAll(async () => {
    const topic = await upsertTopic("Answer Test Topic " + Date.now())
    testTopicId = topic.id
    testTopicName = topic.displayName
  })

  it("should create an answer with version 1", async () => {
    const answer = await createAnswer({
      question: "Test question " + Date.now(),
      answer: "Test answer content",
      topicId: testTopicId,
      topicName: testTopicName,
      tags: ["test", "unit-test"],
    })

    expect(answer).toBeDefined()
    expect(answer.id).toBeDefined()
    expect(answer.status).toBe("Approved")

    const versions = await getAnswerVersions(answer.id)
    expect(versions).toHaveLength(1)
    expect(versions[0]?.versionNumber).toBe(1)
  })

  it("should find answer by fingerprint", async () => {
    const question = "Unique question " + Date.now()
    const answer = await createAnswer({
      question,
      answer: "Answer content",
      topicId: testTopicId,
      topicName: testTopicName,
    })

    const fingerprint = generateFingerprint(question, testTopicName)
    const found = await getAnswerByFingerprint(fingerprint)

    expect(found).toBeDefined()
    expect(found?.id).toBe(answer.id)
  })

  it("should upsert answer (update existing)", async () => {
    const question = "Upsert question " + Date.now()

    // First upsert creates new
    const result1 = await upsertAnswer(
      {
        question,
        answer: "Original answer",
        topicId: testTopicId,
        topicName: testTopicName,
      },
      1
    )

    expect(result1.isNew).toBe(true)
    expect(result1.versionNumber).toBe(1)

    // Second upsert with same question but different answer
    // If answers are too different, it triggers a collision warning
    const result2 = await upsertAnswer(
      {
        question,
        answer: "Completely different answer content that shares no words", // Very different
        topicId: testTopicId,
        topicName: testTopicName,
      },
      2
    )

    // Should still find the same answer (by fingerprint)
    expect(result2.isNew).toBe(false)
    expect(result2.answer.id).toBe(result1.answer.id)

    // If content is materially different, we get a collision issue
    if (result2.issue) {
      expect(result2.issue.type).toBe("collision")
    }

    // Check versions were created (at least initial version)
    const versions = await getAnswerVersions(result1.answer.id)
    expect(versions.length).toBeGreaterThanOrEqual(1)
  })
})

describe("Photo Service", () => {
  let testTopicId: string

  beforeAll(async () => {
    const topic = await upsertTopic("Photo Test Topic " + Date.now())
    testTopicId = topic.id
  })

  it("should create a photo with version 1", async () => {
    const photo = await createPhoto({
      originalFilename: "test-image.png",
      topicId: testTopicId,
      displayTitle: "Test Image " + Date.now(),
      tags: ["test"],
    })

    expect(photo).toBeDefined()
    expect(photo.id).toBeDefined()
    expect(photo.storageKey).toBeDefined()
    expect(photo.storageKey).toHaveLength(36) // UUID format

    const versions = await getPhotoVersions(photo.id)
    expect(versions).toHaveLength(1)
  })

  it("should rename photo without changing storage key", async () => {
    const photo = await createPhoto({
      originalFilename: "rename-test.png",
      topicId: testTopicId,
      displayTitle: "Original Title",
    })

    const originalStorageKey = photo.storageKey

    const renamed = await renamePhoto(photo.id, "New Title")

    expect(renamed.displayTitle).toBe("New Title")
    expect(renamed.storageKey).toBe(originalStorageKey) // KEY INTEGRITY CHECK

    // Should have 2 versions now
    const versions = await getPhotoVersions(photo.id)
    expect(versions.length).toBeGreaterThanOrEqual(2)
  })
})

describe("Link Service", () => {
  let testTopicId: string
  let testTopicName: string

  beforeAll(async () => {
    const topic = await upsertTopic("Link Test Topic " + Date.now())
    testTopicId = topic.id
    testTopicName = topic.displayName
  })

  it("should link answer to photo and retrieve linked items", async () => {
    // Create answer
    const answer = await createAnswer({
      question: "Link test question " + Date.now(),
      answer: "Link test answer",
      topicId: testTopicId,
      topicName: testTopicName,
    })

    // Create photo
    const photo = await createPhoto({
      originalFilename: "link-test.png",
      topicId: testTopicId,
    })

    // Link them
    const link = await linkAnswerToPhoto(answer.id, photo.id)
    expect(link).toBeDefined()

    // Get linked photos from answer
    const linkedPhotos = await getLinkedPhotos(answer.id)
    expect(linkedPhotos).toHaveLength(1)
    expect(linkedPhotos[0]?.id).toBe(photo.id)

    // Get linked answers from photo
    const linkedAnswers = await getLinkedAnswers(photo.id)
    expect(linkedAnswers).toHaveLength(1)
    expect(linkedAnswers[0]?.id).toBe(answer.id)
  })

  it("should unlink answer from photo", async () => {
    // Create and link
    const answer = await createAnswer({
      question: "Unlink test question " + Date.now(),
      answer: "Unlink test answer",
      topicId: testTopicId,
      topicName: testTopicName,
    })

    const photo = await createPhoto({
      originalFilename: "unlink-test.png",
      topicId: testTopicId,
    })

    await linkAnswerToPhoto(answer.id, photo.id)

    // Verify linked
    let linkedPhotos = await getLinkedPhotos(answer.id)
    expect(linkedPhotos).toHaveLength(1)

    // Unlink
    await unlinkAnswerFromPhoto(answer.id, photo.id)

    // Verify unlinked
    linkedPhotos = await getLinkedPhotos(answer.id)
    expect(linkedPhotos).toHaveLength(0)
  })
})
