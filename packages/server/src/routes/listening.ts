/**
 * Topic Ideation (social listening for content ideas), local Express routes.
 * Production runs the same service from api/listening.ts. Both adapt
 * listening/service.ts; keep them in step (scripts/check-route-drift.mjs).
 */
import { Router, type NextFunction, type Request, type Response } from "express"
import rateLimit from "express-rate-limit"
import postgres from "postgres"
import { listeningAllowed } from "../listening/access.js"
import { buildDeps } from "../listening/deps.js"
import { PgCache, PgStore, type Store } from "../listening/store.js"
import * as svc from "../listening/service.js"
import type { RunEvent } from "../listening/types.js"

const router = Router()

let _store: Store | null = null
let _sql: ReturnType<typeof postgres> | null = null
function getStore(): Store {
  if (_store) return _store
  const url = process.env["LISTENING_DATABASE_URL"] || process.env["DATABASE_URL"]
  if (!url) throw new Error("No database configured for Topic Ideation")
  // prepare:false is required behind Supabase's transaction pooler (port 6543): with
  // prepared statements, 15 of 24 concurrent queries hung (measured 2026-10-07).
  _sql = postgres(url, { max: 5, prepare: false, idle_timeout: 20, connect_timeout: 10 })
  _store = new PgStore(_sql as never)
  return _store
}

function ctx(req: Request): svc.ServiceCtx {
  const store = getStore()
  return {
    store,
    userEmail: (req.session?.userEmail ?? "").toLowerCase(),
    deps: () => buildDeps({ store, cache: new PgCache(_sql as never) }),
  }
}

function requireListeningAccess(req: Request, res: Response, next: NextFunction) {
  if (!listeningAllowed(req.session?.userEmail)) return res.status(403).json({ error: "Access denied" })
  next()
}

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false })

router.use(limiter)
router.use(requireListeningAccess)

const send = (res: Response, r: svc.Result<unknown>) =>
  r.ok ? res.json(r.body) : res.status(r.status).json({ error: r.error, code: r.code })

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) => {
  fn(req, res).catch((err) => {
    console.error("[listening]", err)
    if (!res.headersSent) res.status(500).json({ error: "Something went wrong. Try again." })
  })
}

router.get("/access", wrap(async (req, res) => res.json(await svc.access(ctx(req)))))
router.get("/topics", wrap(async (req, res) => res.json(await svc.listTopics(ctx(req)))))
router.get("/topics/:id", wrap(async (req, res) => send(res, await svc.topicDetail(ctx(req), req.params["id"]!))))
router.delete("/topics/:id", wrap(async (req, res) => send(res, await svc.removeTopic(ctx(req), req.params["id"]!))))
router.post("/topics/:id/share", wrap(async (req, res) => send(res, await svc.shareTopic(ctx(req), req.params["id"]!, req.body?.shared))))
router.get("/runs/:id", wrap(async (req, res) => send(res, await svc.runStatus(ctx(req), req.params["id"]!))))
router.post("/runs/:id/cancel", wrap(async (req, res) => send(res, await svc.cancelRun(ctx(req), req.params["id"]!))))
router.get("/ideas", wrap(async (req, res) => res.json(await svc.listIdeas(ctx(req)))))
router.post("/ideas", wrap(async (req, res) => send(res, await svc.saveIdea(ctx(req), req.body ?? {}))))
router.patch("/ideas/:id", wrap(async (req, res) => send(res, await svc.setIdeaStatus(ctx(req), req.params["id"]!, req.body?.status))))
router.delete("/ideas/:id", wrap(async (req, res) => send(res, await svc.removeIdea(ctx(req), req.params["id"]!))))

async function stream(req: Request, res: Response, request: svc.RunRequest) {
  const c = ctx(req)
  const prepared = await svc.prepareRun(c, request)
  if (!prepared.ok) return res.status(prepared.status).json({ error: prepared.error, code: prepared.code })
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache, no-transform")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no")
  res.flushHeaders()
  const write = (e: RunEvent) => {
    if (res.writableEnded || res.destroyed) return
    res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
  }
  await svc.streamRun(c, prepared.body, { write })
  if (!res.writableEnded) res.end()
}

router.post("/topics", wrap((req, res) => stream(req, res, { trigger: "initial", query: req.body?.query, timeWindow: req.body?.timeWindow })))
router.post("/topics/:id/rescan", wrap((req, res) => stream(req, res, { trigger: "rescan", topicId: req.params["id"]! })))
router.post("/topics/:id/rebuild", wrap((req, res) => stream(req, res, { trigger: "rebuild", topicId: req.params["id"]! })))

export default router
