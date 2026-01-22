import { Router } from "express"
import healthRouter from "./health.js"
import topicsRouter from "./topics.js"
import importRouter from "./import.js"
import photosRouter from "./photos.js"
import searchRouter from "./search.js"
import aiRouter from "./ai.js"
import answersRouter from "./answers.js"
import rfpRouter from "./rfp.js"

const router = Router()

router.use("/health", healthRouter)
router.use("/topics", topicsRouter)
router.use("/import", importRouter)
router.use("/photos", photosRouter)
router.use("/search", searchRouter)
router.use("/ai", aiRouter)
router.use("/answers", answersRouter)
router.use("/rfp", rfpRouter)

export default router
