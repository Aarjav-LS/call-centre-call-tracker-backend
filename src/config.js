import { join } from 'node:path'

export const PORT = Number(process.env.PORT) || 3001

const DEFAULT_ORIGIN = 'http://localhost:3000,http://localhost:5173'

export const CORS_ORIGIN = process.env.CORS_ORIGIN || DEFAULT_ORIGIN

export const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data')

export const REPORTS_FILE = process.env.REPORTS_FILE || join(DATA_DIR, 'reports.csv')

export const REPORT_WEBHOOK_URL = process.env.REPORT_WEBHOOK_URL || ''

export const REPORT_TIMEZONE = process.env.REPORT_TIMEZONE || 'UTC'

export function toOriginList(value) {
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}
