import express from 'express'
import { PORT, CORS_ORIGIN, toOriginList } from './config.js'
import { getRecord, initStore, resetState, setState } from './store.js'
import { COUNTER_KEYS, summarize } from './state.js'
import { isSheetConfigured, sanitizeReport, submitReport } from './report.js'

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '256kb' }))

app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && toOriginList(CORS_ORIGIN).includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), sheetConfigured: isSheetConfigured() })
})

app.get('/api/state', (_req, res) => {
  res.json(getRecord())
})

app.put('/api/state', async (req, res, next) => {
  try {
    const body = req.body ?? {}
    const payload = body.state ?? body
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      res.status(400).json({ error: 'Request body must be a state object.' })
      return
    }
    const unknown = Object.keys(payload).filter((key) => !COUNTER_KEYS.includes(key))
    if (unknown.length > 0) {
      res.status(400).json({ error: `Unknown keys: ${unknown.join(', ')}` })
      return
    }
    const missing = COUNTER_KEYS.filter((key) => !(key in payload))
    if (missing.length > 0) {
      res.status(400).json({ error: `Missing keys: ${missing.join(', ')}` })
      return
    }
    const clean = {}
    for (const key of COUNTER_KEYS) {
      const value = Number(payload[key])
      if (!Number.isFinite(value) || value < 0) {
        res.status(400).json({ error: `Invalid value for ${key}. Expected a non-negative number.` })
        return
      }
      clean[key] = Math.floor(value)
    }
    const record = await setState(clean)
    res.json(record)
  } catch (error) {
    next(error)
  }
})

app.post('/api/reset', async (_req, res, next) => {
  try {
    res.json(await resetState())
  } catch (error) {
    next(error)
  }
})

app.post('/api/derive', (req, res) => {
  const record = getRecord()
  res.json(summarize(record.state, record.updatedAt))
})

app.post('/api/report', async (req, res, next) => {
  try {
    const { report, error } = sanitizeReport(req.body)
    if (error) {
      res.status(400).json({ error })
      return
    }
    const result = await submitReport(report)
    res.status(201).json({
      id: result.id,
      operator: result.operator,
      submittedAt: result.submittedAt,
      reportDate: result.reportDate,
      reportTime: result.reportTime,
      timezone: result.timezone,
      delivered: result.delivered,
      message: result.message,
      clusterCount: result.clusters.length,
      derived: result.derived,
    })
  } catch (error) {
    next(error)
  }
})

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

app.use((error, _req, res, _next) => {
  console.error('[api] unhandled error:', error)
  res.status(500).json({ error: 'Internal server error' })
})

await initStore()

const server = app.listen(PORT, () => {
  console.log(`CallTrack API listening on port ${PORT}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}
