import { Router, type Request, type Response } from "express"
import { createAnswer, updateAnswer, deleteAnswer, getAnswerById, getAnswerVersions } from "../services/answerService.js"
import { getTopicById } from "../services/topicService.js"

const router = Router()

/**
 * GET /api/answers/:id/versions
 * Get version history for an answer
 */
router.get("/:id/versions", async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({ error: "ID is required" })
    }

    const existing = await getAnswerById(id)
    if (!existing) {
      return res.status(404).json({ error: "Answer not found" })
    }

    const versions = await getAnswerVersions(id)
    res.json(versions)
  } catch (error) {
    console.error("Failed to get answer versions:", error)
    res.status(500).json({ error: "Failed to get version history" })
  }
})

/**
 * POST /api/answers
 * Create a new answer entry
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { question, answer, topicId, subtopic, status, tags } = req.body

    // Validate required fields
    if (!question?.trim()) {
      return res.status(400).json({ error: "Question is required" })
    }

    if (!answer?.trim()) {
      return res.status(400).json({ error: "Answer is required" })
    }

    if (!topicId) {
      return res.status(400).json({ error: "Topic is required" })
    }

    // Get topic to get the name for fingerprint generation
    const topic = await getTopicById(topicId)
    if (!topic) {
      return res.status(400).json({ error: "Invalid topic ID" })
    }

    const newAnswer = await createAnswer({
      question: question.trim(),
      answer: answer.trim(),
      topicId,
      topicName: topic.name,
      subtopic: subtopic?.trim(),
      status: status || "Draft",
      tags: tags || [],
    })

    res.status(201).json(newAnswer)
  } catch (error) {
    console.error("Failed to create answer:", error)
    res.status(500).json({ error: "Failed to create answer" })
  }
})

/**
 * PUT /api/answers/:id
 * Update an existing answer entry
 */
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { question, answer, topicId, subtopic, status, tags } = req.body

    if (!id) {
      return res.status(400).json({ error: "ID is required" })
    }

    // Get existing answer to check it exists
    const existing = await getAnswerById(id)
    if (!existing) {
      return res.status(404).json({ error: "Answer not found" })
    }

    // Get topic name if topicId is being changed
    let topicName: string | undefined
    if (topicId && topicId !== existing.topicId) {
      const topic = await getTopicById(topicId)
      if (!topic) {
        return res.status(400).json({ error: "Invalid topic ID" })
      }
      topicName = topic.name
    }

    const updatedAnswer = await updateAnswer(id, {
      question: question?.trim(),
      answer: answer?.trim(),
      topicId,
      topicName,
      subtopic: subtopic?.trim(),
      status,
      tags,
    })

    res.json(updatedAnswer)
  } catch (error) {
    console.error("Failed to update answer:", error)
    res.status(500).json({ error: "Failed to update answer" })
  }
})

/**
 * DELETE /api/answers/:id
 * Delete an answer entry
 */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({ error: "ID is required" })
    }

    const existing = await getAnswerById(id)
    if (!existing) {
      return res.status(404).json({ error: "Answer not found" })
    }

    await deleteAnswer(id)

    res.json({ success: true, message: "Answer deleted successfully" })
  } catch (error) {
    console.error("Failed to delete answer:", error)
    res.status(500).json({ error: "Failed to delete answer" })
  }
})

export default router
