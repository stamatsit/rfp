import { Router } from "express"
import { getAllTopics, getTopicById, createTopic, deleteTopic, deleteTopicsByPattern } from "../services/topicService.js"
import { requireWriteAccess } from "../middleware/auth.js"

const router = Router()

// GET /api/topics - List all topics
router.get("/", async (_req, res) => {
  try {
    const topics = await getAllTopics()
    res.json(topics)
  } catch (error) {
    console.error("Error fetching topics:", error)
    res.status(500).json({ error: "Failed to fetch topics" })
  }
})

// GET /api/topics/:id - Get a single topic
router.get("/:id", async (req, res) => {
  try {
    const topic = await getTopicById(req.params.id)

    if (!topic) {
      return res.status(404).json({ error: "Topic not found" })
    }

    res.json(topic)
  } catch (error) {
    console.error("Error fetching topic:", error)
    res.status(500).json({ error: "Failed to fetch topic" })
  }
})

// POST /api/topics - Create a new topic
router.post("/", requireWriteAccess, async (req, res) => {
  try {
    const { displayName } = req.body

    if (!displayName || typeof displayName !== "string") {
      return res.status(400).json({ error: "displayName is required" })
    }

    const topic = await createTopic(displayName)
    res.status(201).json(topic)
  } catch (error) {
    console.error("Error creating topic:", error)

    // Handle unique constraint violation
    if (error instanceof Error && error.message.includes("unique")) {
      return res.status(409).json({ error: "Topic already exists" })
    }

    res.status(500).json({ error: "Failed to create topic" })
  }
})

// DELETE /api/topics/:id - Delete a topic
router.delete("/:id", requireWriteAccess, async (req, res) => {
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({ error: "Topic ID is required" })
    }

    const topic = await getTopicById(id)
    if (!topic) {
      return res.status(404).json({ error: "Topic not found" })
    }

    await deleteTopic(id)
    res.json({ success: true, message: "Topic deleted" })
  } catch (error) {
    console.error("Error deleting topic:", error)
    res.status(500).json({ error: "Failed to delete topic" })
  }
})

// POST /api/topics/cleanup-test-data - Remove test topics matching patterns
router.post("/cleanup-test-data", requireWriteAccess, async (_req, res) => {
  try {
    const testPattern = /Test Topic|Find Test|Link Test|Photo Test|Upsert Test|Answer Test/i
    const deletedCount = await deleteTopicsByPattern(testPattern)

    res.json({
      success: true,
      message: `Deleted ${deletedCount} test topics`,
      deletedCount,
    })
  } catch (error) {
    console.error("Error cleaning up test data:", error)
    res.status(500).json({ error: "Failed to cleanup test data" })
  }
})

export default router
