// Package 10 — bounded generated Advanced Violin projection.
//
// Supports one violin part, up to two simultaneous pitched notes (double stop),
// sustained-string locking, multiple voices/staves, and exact tie continuity.
// It consumes canonical notes only after the caller has passed the existing
// Package 2D VIOLIN quality gate. No source/teacher fingering is invented.

import {
  ADVANCED_VIOLIN_POSITION_POLICY_ID,
  ADVANCED_VIOLIN_POSITION_STATE,
  ADVANCED_VIOLIN_PROVENANCE,
  enumerateAdvancedViolinPositionCandidates,
} from './violinAdvancedPositionResolver.js'

export const ADVANCED_VIOLIN_PROJECTION_STATE = Object.freeze({
  PROJECTED: 'projected',
  UNPLAYABLE: 'unplayable',
  INVALID: 'invalid',
})

const MAX_SIMULTANEOUS_PITCHED = 2
const MAX_SOLVER_NODES = 4096

function freezeDeep(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const key of Reflect.ownKeys(value)) freezeDeep(value[key], seen)
  return Object.freeze(value)
}

function terminal(state, reason) {
  return freezeDeep({
    state,
    reason,
    policyId: ADVANCED_VIOLIN_POSITION_POLICY_ID,
    provenance: ADVANCED_VIOLIN_PROVENANCE,
    teacherApproved: false,
    sourceFingeringClaimed: false,
    noteCount: 0,
    measureCount: 0,
    measures: [],
  })
}

function validIndex(value) {
  return Number.isInteger(value) && value >= 0
}

function validBeat(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function noteIdentityIsValid(note) {
  return note && typeof note === 'object' && !Array.isArray(note) &&
    typeof note.measureKey === 'string' && note.measureKey.trim() !== '' &&
    validIndex(note.measureIndex) &&
    typeof note.partId === 'string' && note.partId.trim() !== '' &&
    validIndex(note.partIndex) &&
    validBeat(note.startBeat) &&
    validBeat(note.beats) &&
    (note.voice === null || note.voice === undefined || typeof note.voice === 'string' || Number.isInteger(note.voice)) &&
    (note.staff === null || note.staff === undefined || typeof note.staff === 'string' || Number.isInteger(note.staff))
}

function voiceToken(note) {
  return `${String(note.voice ?? '')}|${String(note.staff ?? '')}`
}

function candidateTieKey(note, writtenMidi) {
  return `${note.partId}|${voiceToken(note)}|${writtenMidi}`
}

function sameMeasureMetadata(a, b) {
  return a.measureKey === b.measureKey && a.measureIndex === b.measureIndex &&
    a.partId === b.partId && a.partIndex === b.partIndex &&
    String(a.measureNumber ?? '') === String(b.measureNumber ?? '')
}

function positionCost(position) {
  return position.positionNumber * 1000 + position.fingerNumber * 100 + position.stringNumber * 10 + position.semitoneOffset
}

function combinationsFor(entries, unavailableStrings, fixedStrings, nodeBudget) {
  const ordered = entries.map((entry) => ({
    ...entry,
    candidates: entry.candidates.filter((candidate) =>
      !unavailableStrings.has(candidate.stringNumber) && !fixedStrings.has(candidate.stringNumber),
    ),
  }))
  if (ordered.some((entry) => entry.candidates.length === 0)) return []

  const results = []
  const used = new Set(fixedStrings)
  const chosen = []

  function visit(index) {
    nodeBudget.count += 1
    if (nodeBudget.count > MAX_SOLVER_NODES) throw new Error('solver-node-limit')
    if (index >= ordered.length) {
      results.push(chosen.slice())
      return
    }
    for (const candidate of ordered[index].candidates) {
      if (used.has(candidate.stringNumber)) continue
      used.add(candidate.stringNumber)
      chosen.push({ entry: ordered[index], position: candidate })
      visit(index + 1)
      chosen.pop()
      used.delete(candidate.stringNumber)
    }
  }

  visit(0)
  results.sort((a, b) => {
    const costA = a.reduce((sum, item) => sum + positionCost(item.position), 0)
    const costB = b.reduce((sum, item) => sum + positionCost(item.position), 0)
    if (costA !== costB) return costA - costB
    const keyA = a.map((item) => `${item.position.stringNumber}:${item.position.positionNumber}:${item.position.fingerNumber}`).join('|')
    const keyB = b.map((item) => `${item.position.stringNumber}:${item.position.positionNumber}:${item.position.fingerNumber}`).join('|')
    return keyA.localeCompare(keyB)
  })
  return results
}

function normalizeEntries(notes) {
  const parts = new Map()
  const measures = new Map()
  const entries = []

  for (let noteIndex = 0; noteIndex < notes.length; noteIndex += 1) {
    const note = notes[noteIndex]
    if (!noteIdentityIsValid(note)) return { error: 'invalid-canonical-physical-identity' }

    parts.set(`${note.partIndex}:${note.partId}`, true)
    const prior = measures.get(note.measureKey)
    if (prior && !sameMeasureMetadata(prior, note)) return { error: 'conflicting-measure-identity' }
    if (!prior) measures.set(note.measureKey, note)

    if (note.isRest === true) {
      entries.push({ noteIndex, note, resolver: null, writtenMidi: null, candidates: [] })
      continue
    }

    const resolver = enumerateAdvancedViolinPositionCandidates(note)
    if (resolver.state === ADVANCED_VIOLIN_POSITION_STATE.INVALID) return { error: resolver.reason || 'invalid-written-pitch' }
    if (resolver.state === ADVANCED_VIOLIN_POSITION_STATE.OUT_OF_RANGE) return { unplayable: resolver.reason || 'pitch-out-of-range' }
    if (resolver.state !== ADVANCED_VIOLIN_POSITION_STATE.CANDIDATES) return { error: 'unexpected-position-state' }

    entries.push({
      noteIndex,
      note,
      resolver,
      writtenMidi: resolver.writtenMidi,
      candidates: resolver.candidates,
    })
  }

  if (parts.size !== 1) return { error: 'single-violin-part-required' }
  return { entries }
}

/**
 * Project canonical notes into a bounded generated advanced violin plan.
 * No partial plan is returned when any group is impossible or malformed.
 */
export function projectCanonicalNotesToAdvancedViolin(notes) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return terminal(ADVANCED_VIOLIN_PROJECTION_STATE.INVALID, 'canonical-note-array-required')
  }

  const normalized = normalizeEntries(notes)
  if (normalized.error) return terminal(ADVANCED_VIOLIN_PROJECTION_STATE.INVALID, normalized.error)
  if (normalized.unplayable) return terminal(ADVANCED_VIOLIN_PROJECTION_STATE.UNPLAYABLE, normalized.unplayable)

  const groupMap = new Map()
  for (const entry of normalized.entries) {
    const key = `${entry.note.measureIndex}|${entry.note.measureKey}|${entry.note.startBeat}`
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key).push(entry)
  }

  const groups = [...groupMap.values()].sort((a, b) =>
    (a[0].note.measureIndex - b[0].note.measureIndex) ||
    (a[0].note.startBeat - b[0].note.startBeat) ||
    (a[0].noteIndex - b[0].noteIndex),
  )

  const tieLocks = new Map()
  let activeUntil = new Map()
  let previousMeasureIndex = null
  const projectedGroups = []
  const nodeBudget = { count: 0 }

  try {
    for (const group of groups) {
      const sample = group[0].note
      if (previousMeasureIndex !== null && sample.measureIndex !== previousMeasureIndex) {
        activeUntil = new Map()
      }
      previousMeasureIndex = sample.measureIndex

      const pitched = group.filter((entry) => entry.note.isRest !== true)
      if (pitched.length > MAX_SIMULTANEOUS_PITCHED) {
        return terminal(ADVANCED_VIOLIN_PROJECTION_STATE.UNPLAYABLE, 'more-than-two-simultaneous-pitched-notes')
      }

      const unavailableStrings = new Set()
      for (const [stringNumber, endBeat] of activeUntil) {
        if (endBeat > sample.startBeat) unavailableStrings.add(stringNumber)
      }
      for (const lock of tieLocks.values()) unavailableStrings.add(lock.position.stringNumber)

      const fixed = []
      const newEntries = []
      for (const entry of pitched) {
        const tieKey = candidateTieKey(entry.note, entry.writtenMidi)
        if (entry.note.tieStop === true) {
          const lock = tieLocks.get(tieKey)
          if (!lock) return terminal(ADVANCED_VIOLIN_PROJECTION_STATE.UNPLAYABLE, 'tie-stop-without-established-position')
          fixed.push({ entry, position: lock.position, tieKey })
        } else {
          newEntries.push(entry)
        }
      }

      const fixedStrings = new Set(fixed.map((item) => item.position.stringNumber))
      for (const stringNumber of fixedStrings) unavailableStrings.delete(stringNumber)
      if (fixedStrings.size !== fixed.length) {
        return terminal(ADVANCED_VIOLIN_PROJECTION_STATE.UNPLAYABLE, 'simultaneous-ties-share-string')
      }

      let chosenNew = []
      if (newEntries.length > 0) {
        const combinations = combinationsFor(newEntries, unavailableStrings, fixedStrings, nodeBudget)
        if (combinations.length === 0) {
          return terminal(ADVANCED_VIOLIN_PROJECTION_STATE.UNPLAYABLE, 'no-distinct-string-assignment')
        }
        chosenNew = combinations[0]
      }

      const assignments = [...fixed, ...chosenNew].sort((a, b) => a.entry.noteIndex - b.entry.noteIndex)
      const events = []

      for (const entry of group.sort((a, b) => a.noteIndex - b.noteIndex)) {
        if (entry.note.isRest === true) {
          events.push(freezeDeep({
            noteIndex: entry.noteIndex,
            note: entry.note,
            measureKey: entry.note.measureKey,
            isRest: true,
            position: null,
            alternatives: [],
            policyId: ADVANCED_VIOLIN_POSITION_POLICY_ID,
            provenance: ADVANCED_VIOLIN_PROVENANCE,
            teacherApproved: false,
          }))
          continue
        }

        const assignment = assignments.find((item) => item.entry.noteIndex === entry.noteIndex)
        if (!assignment) return terminal(ADVANCED_VIOLIN_PROJECTION_STATE.INVALID, 'missing-solver-assignment')
        const position = assignment.position
        const tieKey = candidateTieKey(entry.note, entry.writtenMidi)

        if (entry.note.tieStop === true && entry.note.tieStart !== true) tieLocks.delete(tieKey)
        if (entry.note.tieStart === true) tieLocks.set(tieKey, { position })

        if (entry.note.tieStart !== true && entry.note.tieStop !== true && entry.note.beats > 0 && entry.note.isGrace !== true) {
          activeUntil.set(position.stringNumber, entry.note.startBeat + entry.note.beats)
        }

        events.push(freezeDeep({
          noteIndex: entry.noteIndex,
          note: entry.note,
          measureKey: entry.note.measureKey,
          isRest: false,
          position: { ...position },
          alternatives: entry.candidates.map((candidate) => ({ ...candidate })),
          policyId: ADVANCED_VIOLIN_POSITION_POLICY_ID,
          provenance: ADVANCED_VIOLIN_PROVENANCE,
          teacherApproved: false,
        }))
      }

      projectedGroups.push(freezeDeep({
        measureKey: sample.measureKey,
        measureNumber: sample.measureNumber ?? null,
        measureIndex: sample.measureIndex,
        startBeat: sample.startBeat,
        events,
      }))
    }
  } catch (error) {
    if (error?.message === 'solver-node-limit') {
      return terminal(ADVANCED_VIOLIN_PROJECTION_STATE.UNPLAYABLE, 'solver-node-limit')
    }
    return terminal(ADVANCED_VIOLIN_PROJECTION_STATE.INVALID, 'advanced-violin-solver-failed')
  }

  if (tieLocks.size > 0) {
    return terminal(ADVANCED_VIOLIN_PROJECTION_STATE.UNPLAYABLE, 'dangling-tie-start')
  }

  const measureMap = new Map()
  for (const group of projectedGroups) {
    if (!measureMap.has(group.measureKey)) {
      measureMap.set(group.measureKey, {
        measureKey: group.measureKey,
        measureNumber: group.measureNumber,
        measureIndex: group.measureIndex,
        groups: [],
      })
    }
    measureMap.get(group.measureKey).groups.push(group)
  }

  const measures = [...measureMap.values()]
    .sort((a, b) => a.measureIndex - b.measureIndex)
    .map((measure) => freezeDeep(measure))

  return freezeDeep({
    state: ADVANCED_VIOLIN_PROJECTION_STATE.PROJECTED,
    reason: null,
    policyId: ADVANCED_VIOLIN_POSITION_POLICY_ID,
    provenance: ADVANCED_VIOLIN_PROVENANCE,
    teacherApproved: false,
    sourceFingeringClaimed: false,
    noteCount: notes.length,
    measureCount: measures.length,
    measures,
  })
}