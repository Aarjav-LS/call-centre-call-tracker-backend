import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { REPORT_TIMEZONE, REPORT_WEBHOOK_URL, REPORTS_FILE } from './config.js'
import { COUNTER_KEYS, sanitizeState, summarize } from './state.js'

const MAX_CLUSTERS = 500

const dateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORT_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function formatDateTime(date) {
  const parts = {}
  for (const part of dateTimeFormatter.formatToParts(date)) {
    parts[part.type] = part.value
  }
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  }
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

export function sanitizeCluster(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
  const code = cleanText(entry.code, 24)
  const college = cleanText(entry.college, 120)
  if (!code || !college) return null
  return { code, college }
}

export function sanitizeReport(body) {
  if (!body || typeof body !== 'object') return { error: 'Request body must be an object.' }
  const operator = cleanText(body.operator, 80)
  if (!operator) return { error: 'Operator name is required.' }

  const state = sanitizeState(body.state)
  if (!state) return { error: 'A complete set of call counters is required.' }

  if (!Array.isArray(body.clusters)) return { error: 'clusters must be an array.' }
  if (body.clusters.length > MAX_CLUSTERS) {
    return { error: `A report can hold at most ${MAX_CLUSTERS} clusters.` }
  }
  const clusters = []
  for (const entry of body.clusters) {
    const cluster = sanitizeCluster(entry)
    if (cluster) clusters.push(cluster)
  }

  const submittedAt = new Date()
  const { date, time } = formatDateTime(submittedAt)

  return {
    report: {
      id: randomUUID(),
      operator,
      submittedAt: submittedAt.toISOString(),
      reportDate: date,
      reportTime: time,
      timezone: REPORT_TIMEZONE,
      state,
      derived: summarize(state, new Date().toISOString()).derived,
      clusters,
    },
  }
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function summaryRow(report) {
  const cells = [
    report.reportDate,
    report.reportTime,
    report.operator,
    ...COUNTER_KEYS.map((key) => report.state[key]),
    report.derived.totalReceived,
    report.derived.totalNotReceived,
    report.derived.totalCalls,
    report.derived.coverage,
  ]
  return cells.map(csvCell).join(',')
}

function clusterRow(report) {
  return report.clusters
    .map((cluster) =>
      [report.reportDate, report.reportTime, report.operator, cluster.code, cluster.college]
        .map(csvCell)
        .join(','),
    )
    .join('\n')
}

const HEADERS = [
  ['report_date', 'report_time', 'operator', ...COUNTER_KEYS,
    'total_received', 'total_not_received', 'total_calls', 'coverage_percent'].join(','),
]

const CLUSTER_HEADERS = 'report_date,report_time,operator,cluster_code,college_name'

async function appendLocal(report) {
  const dir = dirname(REPORTS_FILE)
  await mkdir(dir, { recursive: true })
  let needsHeaders = false
  try {
    await readFile(REPORTS_FILE, 'utf8')
  } catch {
    needsHeaders = true
  }
  const lines = []
  if (needsHeaders) lines.push(HEADERS.join(','))
  lines.push(summaryRow(report))
  await appendFile(REPORTS_FILE, `${lines.join('\n')}\n`, 'utf8')

  if (report.clusters.length > 0) {
    const clusterFile = REPORTS_FILE.replace(/\.csv$/, '-clusters.csv')
    let needsClusterHeaders = false
    try {
      await readFile(clusterFile, 'utf8')
    } catch {
      needsClusterHeaders = true
    }
    const clusterLines = []
    if (needsClusterHeaders) clusterLines.push(CLUSTER_HEADERS)
    clusterLines.push(clusterRow(report))
    await appendFile(clusterFile, `${clusterLines.join('\n')}\n`, 'utf8')
  }
}

async function pushToSheet(report) {
  const response = await fetch(REPORT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  })
  if (!response.ok) {
    throw new Error(`Sheet endpoint responded with ${response.status}`)
  }
  return response
}

export async function submitReport(report) {
  if (!REPORT_WEBHOOK_URL) {
    await appendLocal(report)
    return { ...report, delivered: 'local', message: 'Saved to the server log. No sheet is configured.' }
  }
  try {
    await pushToSheet(report)
    return { ...report, delivered: 'sheet', message: 'Appended to the shared sheet.' }
  } catch (error) {
    await appendLocal(report)
    return {
      ...report,
      delivered: 'local',
      message: `Sheet unreachable (${error.message}). Saved to the server log instead.`,
    }
  }
}

export function isSheetConfigured() {
  return Boolean(REPORT_WEBHOOK_URL)
}
