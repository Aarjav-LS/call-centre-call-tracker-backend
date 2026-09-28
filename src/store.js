import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createRecord, initialState, sanitizeState } from './state.js'

const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data')
const dataFile = join(dataDir, 'state.json')

let record = createRecord({ ...initialState })
let writeQueue = Promise.resolve()

async function readFromDisk() {
  try {
    const raw = await readFile(dataFile, 'utf8')
    const parsed = JSON.parse(raw)
    const clean = sanitizeState(parsed?.state)
    if (!clean) return
    record = { id: parsed.id ?? record.id, ...createRecord(clean) }
    record.updatedAt = parsed.updatedAt ?? record.updatedAt
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('[store] could not read persisted state, using defaults:', error.message)
    }
  }
}

function persist() {
  writeQueue = writeQueue.then(async () => {
    await mkdir(dirname(dataFile), { recursive: true })
    const tempFile = `${dataFile}.tmp`
    await writeFile(tempFile, JSON.stringify(record, null, 2), 'utf8')
    await rename(tempFile, dataFile)
  }).catch((error) => {
    console.error('[store] failed to persist state:', error.message)
  })
  return writeQueue
}

export async function initStore() {
  await readFromDisk()
  return record
}

export function getRecord() {
  return record
}

export async function setState(state) {
  const next = createRecord(state)
  record = next
  await persist()
  return record
}

export async function resetState() {
  return setState({ ...initialState })
}

export function flush() {
  return writeQueue
}
