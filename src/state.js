import { randomUUID } from 'node:crypto'

export const OUTCOME_KEYS = [
  'courseNA',
  'feesHesitation',
  'discussParents',
  'needsFollowUp',
  'confirmedVisits',
  'notInterested',
  'alreadyVisited',
  'alreadyAdmitted',
  'hungUp',
  'wrongNumber',
]

export const COUNTER_KEYS = [...OUTCOME_KEYS, 'notReceived']

export const initialState = Object.freeze({
  courseNA: 19,
  feesHesitation: 15,
  discussParents: 14,
  needsFollowUp: 21,
  confirmedVisits: 12,
  notInterested: 11,
  alreadyVisited: 8,
  alreadyAdmitted: 7,
  hungUp: 13,
  wrongNumber: 8,
  notReceived: 37,
})

function sanitizeCount(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.max(0, Math.floor(numeric))
}

export function sanitizeState(input) {
  if (!input || typeof input !== 'object') return null
  const next = {}
  for (const key of COUNTER_KEYS) {
    const count = sanitizeCount(input[key])
    if (count === null) return null
    next[key] = count
  }
  return next
}

export function totalReceived(state) {
  return OUTCOME_KEYS.reduce((sum, key) => sum + state[key], 0)
}

export function totalCalls(state) {
  return totalReceived(state) + state.notReceived
}

export function summarize(state, updatedAt) {
  const received = totalReceived(state)
  const calls = received + state.notReceived
  return {
    state,
    derived: {
      totalReceived: received,
      totalNotReceived: state.notReceived,
      totalCalls: calls,
      coverage: calls === 0 ? 0 : Math.round((received / calls) * 100),
    },
    updatedAt,
  }
}

export function createRecord(state) {
  return { id: randomUUID(), ...summarize(state, new Date().toISOString()) }
}
