import { Router } from "express"
import healthRouter from "./health.js"
import topicsRouter from "./topics.js"
import importRouter from "./import.js"
import photosRouter from "./photos.js"
import searchRouter from "./search.js"
import aiRouter from "./ai.js"
import answersRouter from "./answers.js"
import rfpRouter from "./rfp.js"
import proposalsRouter from "./proposals.js"
import unifiedAIRouter from "./unifiedAI.js"
import feedbackRouter from "./feedback.js"
import clientSuccessRouter from "./clientSuccess.js"
import conversationsRouter from "./conversations.js"
import studioRouter from "./studio.js"
import companionRouter from "./companion.js"
import humanizerRouter from "./humanizer.js"

const router = Router()

router.use("/health", healthRouter)
router.use("/topics", topicsRouter)
router.use("/import", importRouter)
router.use("/photos", photosRouter)
router.use("/search", searchRouter)
router.use("/ai", aiRouter)
router.use("/answers", answersRouter)
router.use("/rfp", rfpRouter)
router.use("/proposals", proposalsRouter)
router.use("/unified-ai", unifiedAIRouter)
router.use("/feedback", feedbackRouter)
router.use("/client-success", clientSuccessRouter)
router.use("/conversations", conversationsRouter)
router.use("/studio", studioRouter)
router.use("/companion", companionRouter)
router.use("/humanizer", humanizerRouter)

export default router
