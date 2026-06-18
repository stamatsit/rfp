import { Router, type Request, type Response } from "express"
import { queryAI, adaptContent, streamAI, type AdaptationType } from "../services/aiService.js"
import { queryCaseStudyInsights, streamCaseStudyInsights } from "../services/caseStudyAIService.js"
import { findTestimonials } from "../services/testimonialAIService.js"
import { streamClientChat, analyzeClientGaps, type ClientChatContext } from "../services/clientAIService.js"

const router = Router()

/**
 * POST /api/ai/query
 * Query the AI with a question
 * AI will only respond using approved library content
 */
router.post("/query", async (req: Request, res: Response) => {
  try {
    const { query, topicId, maxSources } = req.body

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Query is required" })
    }

    if (query.trim().length < 3) {
      return res.status(400).json({ error: "Query must be at least 3 characters" })
    }

    if (query.length > 1000) {
      return res.status(400).json({ error: "Query must be less than 1000 characters" })
    }

    const result = await queryAI(query.trim(), {
      topicId: topicId as string | undefined,
      maxSources: maxSources ? parseInt(maxSources, 10) : undefined,
    })

    res.json(result)
  } catch (error) {
    console.error("AI query endpoint failed:", error)
    res.status(500).json({ error: "Failed to process AI query" })
  }
})

/**
 * POST /api/ai/stream
 * Stream Q&A Library AI responses via SSE
 */
router.post("/stream", async (req: Request, res: Response) => {
  try {
    const { query, topicId, maxSources, conversationHistory, responseLength } = req.body

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Query is required" })
    }

    if (query.trim().length < 3) {
      return res.status(400).json({ error: "Query must be at least 3 characters" })
    }

    if (query.length > 1000) {
      return res.status(400).json({ error: "Query must be less than 1000 characters" })
    }

    await streamAI(
      query.trim(),
      res,
      { topicId: topicId as string | undefined, maxSources: maxSources ? parseInt(maxSources, 10) : undefined, responseLength: responseLength as string | undefined },
      conversationHistory
    )
  } catch (error) {
    console.error("AI stream failed:", error)
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to stream AI response" })
    }
  }
})

/**
 * POST /api/ai/adapt
 * Adapt existing content for specific RFP needs
 * Supports: shorten, expand, bullets, formal, casual, custom
 */
router.post("/adapt", async (req: Request, res: Response) => {
  try {
    const { content, adaptationType, customInstruction, targetWordCount, clientName, industry } = req.body

    if (!content || typeof content !== "string") {
      return res.status(400).json({ error: "Content is required" })
    }

    if (content.trim().length < 10) {
      return res.status(400).json({ error: "Content must be at least 10 characters" })
    }

    if (content.length > 5000) {
      return res.status(400).json({ error: "Content must be less than 5000 characters" })
    }

    const validTypes: AdaptationType[] = ["shorten", "expand", "bullets", "formal", "casual", "custom"]
    if (!adaptationType || !validTypes.includes(adaptationType)) {
      return res.status(400).json({ error: `Invalid adaptation type. Must be one of: ${validTypes.join(", ")}` })
    }

    const result = await adaptContent(content.trim(), adaptationType as AdaptationType, {
      customInstruction: customInstruction as string | undefined,
      targetWordCount: targetWordCount ? parseInt(targetWordCount, 10) : undefined,
      clientName: clientName as string | undefined,
      industry: industry as string | undefined,
    })

    res.json(result)
  } catch (error) {
    console.error("AI adapt endpoint failed:", error)
    res.status(500).json({ error: "Failed to adapt content" })
  }
})

/**
 * POST /api/ai/case-studies
 * AI-powered case study builder — helps users craft case studies
 */
router.post("/case-studies", async (req: Request, res: Response) => {
  try {
    const { query } = req.body

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Query is required" })
    }

    if (query.trim().length < 2) {
      return res.status(400).json({ error: "Query must be at least 2 characters" })
    }

    if (query.length > 2000) {
      return res.status(400).json({ error: "Query must be less than 2000 characters" })
    }

    const result = await queryCaseStudyInsights(query.trim())
    res.json(result)
  } catch (error) {
    console.error("Case study AI failed:", error)
    res.status(500).json({ error: "Failed to process case study request" })
  }
})

/**
 * POST /api/ai/case-studies/stream
 * Stream Case Study Insights via SSE
 */
router.post("/case-studies/stream", async (req: Request, res: Response) => {
  try {
    const { query, conversationHistory, responseLength } = req.body

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Query is required" })
    }

    if (query.trim().length < 2) {
      return res.status(400).json({ error: "Query must be at least 2 characters" })
    }

    if (query.length > 2000) {
      return res.status(400).json({ error: "Query must be less than 2000 characters" })
    }

    await streamCaseStudyInsights(query.trim(), res, conversationHistory, responseLength as string | undefined)
  } catch (error) {
    console.error("Case study stream failed:", error)
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to stream case study response" })
    }
  }
})

/**
 * POST /api/ai/testimonial-finder
 * AI-powered testimonial finder — describe what you need, get the best matches
 */
router.post("/testimonial-finder", async (req: Request, res: Response) => {
  try {
    const { description, sector, limit } = req.body

    if (!description || typeof description !== "string") {
      return res.status(400).json({ error: "Description is required" })
    }

    if (description.trim().length < 3) {
      return res.status(400).json({ error: "Description must be at least 3 characters" })
    }

    if (description.length > 2000) {
      return res.status(400).json({ error: "Description must be less than 2000 characters" })
    }

    const result = await findTestimonials(description.trim(), {
      sector: sector as string | undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    })

    res.json(result)
  } catch (error) {
    console.error("Testimonial finder failed:", error)
    res.status(500).json({ error: "Failed to find testimonials" })
  }
})

/**
 * POST /api/ai/client-chat/stream
 * Stream per-client AI chat via SSE.
 * Body: { query, clientContext: ClientChatContext, conversationHistory?: [...] }
 */
router.post("/client-chat/stream", async (req: Request, res: Response) => {
  try {
    const { query, clientContext, conversationHistory } = req.body

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Query is required" })
    }
    if (query.trim().length < 2) {
      return res.status(400).json({ error: "Query must be at least 2 characters" })
    }
    if (query.length > 2000) {
      return res.status(400).json({ error: "Query must be less than 2000 characters" })
    }
    if (!clientContext || !clientContext.clientName) {
      return res.status(400).json({ error: "clientContext with clientName is required" })
    }

    await streamClientChat(
      query.trim(),
      clientContext as ClientChatContext,
      res,
      conversationHistory
    )
  } catch (error) {
    console.error("Client chat stream failed:", error)
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to stream client chat response" })
    }
  }
})

/**
 * POST /api/ai/client-gap-analysis
 * Analyze gaps in a client's asset portfolio.
 * Body: { clientContext: ClientChatContext }
 */
router.post("/client-gap-analysis", async (req: Request, res: Response) => {
  try {
    const { clientContext } = req.body
    if (!clientContext || !clientContext.clientName) {
      return res.status(400).json({ error: "clientContext with clientName is required" })
    }
    const markdown = await analyzeClientGaps(clientContext as ClientChatContext)
    res.json({ markdown })
  } catch (error) {
    console.error("Client gap analysis failed:", error)
    res.status(500).json({ error: "Failed to analyze client gaps" })
  }
})

/**
 * GET /api/ai/status
 * Check if AI service is configured and available
 */
/**
 * POST /api/ai/adapt-bulk
 * Adapt multiple content items in parallel
 * Max 20 items per request
 */
router.post("/adapt-bulk", async (req: Request, res: Response) => {
  try {
    const { items, adaptationType, customInstruction, targetWordCount, clientName, industry } = req.body

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items array is required" })
    }
    if (items.length > 20) {
      return res.status(400).json({ error: "Maximum 20 items per bulk request" })
    }

    const validTypes: AdaptationType[] = ["shorten", "expand", "bullets", "formal", "casual", "custom"]
    if (!adaptationType || !validTypes.includes(adaptationType)) {
      return res.status(400).json({ error: `Invalid adaptation type. Must be one of: ${validTypes.join(", ")}` })
    }

    const results = await Promise.allSettled(
      items.map(async (item: { id: string; content: string }) => {
        const result = await adaptContent(item.content, adaptationType as AdaptationType, {
          customInstruction: customInstruction as string | undefined,
          targetWordCount: targetWordCount ? parseInt(targetWordCount, 10) : undefined,
          clientName: clientName as string | undefined,
          industry: industry as string | undefined,
        })
        return { id: item.id, ...result }
      })
    )

    const output = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value
      return {
        id: items[i].id,
        adaptedContent: "",
        originalContent: items[i].content,
        instruction: adaptationType,
        refused: true,
        refusalReason: (r.reason as Error)?.message || "Adaptation failed",
      }
    })

    res.json({ results: output })
  } catch (error) {
    console.error("Bulk adapt failed:", error)
    res.status(500).json({ error: "Failed to bulk adapt content" })
  }
})

router.get("/status", async (_req: Request, res: Response) => {
  const configured = !!process.env.OPENAI_API_KEY

  res.json({
    configured,
    model: configured ? "gpt-4o" : null,
    message: configured
      ? "AI service is ready"
      : "AI service not configured. Set OPENAI_API_KEY in environment.",
  })
})

/**
 * POST /api/ai/alt-text
 * Generate alt text for an image using GPT-4o Vision
 */
router.post("/alt-text", async (req: Request, res: Response) => {
  try {
    const { image } = req.body
    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: "Base64 image required" })
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: "OpenAI not configured" })
    }
    const { default: OpenAI } = await import("openai")
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Write a concise, descriptive alt text for this image. Focus on what's visually important — people, actions, objects, setting. Keep it under 125 characters for web accessibility best practices. Return only the alt text, no quotes or explanation." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}`, detail: "low" } },
          ],
        },
      ],
      max_tokens: 100,
    })
    const altText = completion.choices[0]?.message?.content?.trim() || ""
    return res.json({ altText })
  } catch (err: any) {
    console.error("Alt text generation failed:", err?.message)
    return res.status(500).json({ error: "Alt text generation failed" })
  }
})

/**
 * Image enhancement via Replicate (real models, server-side).
 * Maps each enhance op to a model version + inputs.
 */
const REPLICATE_ENHANCE_MODELS: Record<
  string,
  { version: string; input: (image: string) => Record<string, unknown> }
> = {
  "upscale-2x": {
    version: "b3ef194191d13140337468c916c2c5b96dd0cb06dffc032a022a31807f6a5ea8",
    input: (image) => ({ image, scale: 2, face_enhance: false }),
  },
  "upscale-4x": {
    version: "b3ef194191d13140337468c916c2c5b96dd0cb06dffc032a022a31807f6a5ea8",
    input: (image) => ({ image, scale: 4, face_enhance: false }),
  },
  denoise: {
    version: "660d922d33153019e8c263a3bba265de882e7f4f70396546b6c9c8f9d47a021a",
    input: (image) => ({ image, task_type: "Color Image Denoising", noise: 15 }),
  },
  deblur: {
    version: "018241a6c880319404eaa2714b764313e27e11f950a7ff0a7b5b37b27b74dcf7",
    input: (image) => ({ image, task_type: "Image Debluring (GoPro)" }),
  },
  "low-light": {
    version: "4328e402cfedafa70ad7cec04412e86ab61832204deccd94108ae5222c9b1ae1",
    input: (image) => ({ image }),
  },
  retouch: {
    version: "cc4956dd26fa5a7185d5660cc9100fab1b8070a1d1654a8bb5eb6d443b020bb2",
    input: (image) => ({
      image,
      upscale: 1,
      face_upsample: true,
      background_enhance: true,
      codeformer_fidelity: 0.7,
    }),
  },
}

/**
 * POST /api/ai/enhance
 * Create a Replicate prediction for an enhance op. Returns { id }.
 */
router.post("/enhance", async (req: Request, res: Response) => {
  try {
    const { image, op } = req.body || {}
    const model = typeof op === "string" ? REPLICATE_ENHANCE_MODELS[op] : undefined
    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: "image (data URL) required" })
    }
    if (!model) return res.status(400).json({ error: "Unknown enhance operation" })
    if (!process.env.REPLICATE_API_TOKEN) {
      return res.status(503).json({ error: "Replicate not configured" })
    }
    const createPrediction = () =>
      fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ version: model.version, input: model.input(image) }),
      })
    let r = await createPrediction()
    // Trial accounts are throttled (~6/min) — retry once on rate limit.
    if (r.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 7000))
      r = await createPrediction()
    }
    const data = await r.json()
    if (!r.ok) {
      console.error("Replicate create failed:", data)
      const msg = r.status === 429 ? "Replicate rate limit hit — wait a moment and retry" : data?.detail || "Replicate request failed"
      return res.status(502).json({ error: msg })
    }
    return res.json({ id: data.id, status: data.status })
  } catch (err: any) {
    console.error("Enhance create failed:", err?.message)
    return res.status(500).json({ error: "Enhance request failed" })
  }
})

/**
 * GET /api/ai/enhance-status?id=...
 * Poll a Replicate prediction. On success, download the output and return
 * it as a base64 data URL (avoids client CSP / keeps the token server-side).
 */
router.get("/enhance-status", async (req: Request, res: Response) => {
  try {
    const id = req.query.id
    if (!id || typeof id !== "string") return res.status(400).json({ error: "id required" })
    if (!process.env.REPLICATE_API_TOKEN) {
      return res.status(503).json({ error: "Replicate not configured" })
    }
    const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
    })
    const data = await r.json()
    if (!r.ok) return res.status(502).json({ error: data?.detail || "Replicate status failed" })

    if (data.status === "failed" || data.status === "canceled") {
      return res.json({ status: data.status, error: data.error || "Enhancement failed" })
    }
    // succeeded | starting | processing — the finished image is fetched
    // separately via /enhance-result to avoid large JSON payloads.
    return res.json({ status: data.status })
  } catch (err: any) {
    console.error("Enhance status failed:", err?.message)
    return res.status(500).json({ error: "Enhance status failed" })
  }
})

/**
 * GET /api/ai/enhance-result?id=...
 * Stream the finished prediction's image back same-origin (binary, not
 * base64) so the client can use it on a canvas without CORS taint.
 */
router.get("/enhance-result", async (req: Request, res: Response) => {
  try {
    const id = req.query.id
    if (!id || typeof id !== "string") return res.status(400).json({ error: "id required" })
    if (!process.env.REPLICATE_API_TOKEN) {
      return res.status(503).json({ error: "Replicate not configured" })
    }
    const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
    })
    const data = await r.json()
    if (!r.ok) return res.status(502).json({ error: data?.detail || "Replicate status failed" })
    if (data.status !== "succeeded") return res.status(409).json({ error: "Result not ready" })
    const out = Array.isArray(data.output) ? data.output[data.output.length - 1] : data.output
    if (!out || typeof out !== "string") return res.status(502).json({ error: "Model produced no image" })
    const imgRes = await fetch(out)
    if (!imgRes.ok) return res.status(502).json({ error: "Could not download result" })
    const buf = Buffer.from(await imgRes.arrayBuffer())
    res.setHeader("Content-Type", imgRes.headers.get("content-type") || "image/png")
    res.setHeader("Cache-Control", "no-store")
    return res.send(buf)
  } catch (err: any) {
    console.error("Enhance result failed:", err?.message)
    return res.status(500).json({ error: "Enhance result failed" })
  }
})

export default router
