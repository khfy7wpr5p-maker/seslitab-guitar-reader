// Package 9 — bounded advanced Guitar TAB projection.
//
// This module extends the existing Package 4 physical-position contract to
// one guitar part containing chords, simultaneous pitched events, multiple
// voices/staves and sustained notes. It never invents pitch, timing or source
// fingering and fails closed when no distinct-string assignment exists.

import {
  GUITAR_POSITION_CANDIDATE_STATE,
  enumerateCanonicalGuitarPositionCandidates,
} from './guitarPositionResolver.js'

export const ADVANCED_GUITAR_TAB_POLICY_ID = 'seslitab-advanced-guitar-v1'
export const ADVANCED_GUITAR_TAB_PROVENANCE = 'generated-advanced'
export const ADVANCED_GUITAR_TAB_MAX_SEARCH_NODES = 100000

export const ADVANCED_GUITAR_TAB_PROJECTION_STATE = Object.freeze({
  PROJECTED: 'projected',
  UNPLAYABLE: 'unplayable',
  COMPLEXITY_LIMIT: 'complexity-limit',
  INVALID: 'invalid',
})

function isFiniteNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isNonNegativeInteger(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function physicalPartKey(note) {
  return `${note.partId}:${note.partIndex}`
}

function validatePhysicalIdentity(note) {
  return (
    note &&
    typeof note === 'object' &&
    !Array.isArray(note) &&
    typeof note.measureKey === 'string' &&
    note.measureKey.trim() !== '' &&
    isNonNegativeInteger(note.measureIndex) &&
    typeof note.partId === 'string' &&
    note.partId.trim() !== '' &&
    isNonNegativeInteger(note.partIndex) &&
    isFiniteNonNegativeNumber(note.startBeat) &&
    isFiniteNonNegativeNumber(note.beats)
  )
}

function tieKey(event) {
  return `${event.writtenMidi}:${String(event.note.voice ?? '')}:${String(event.note.staff ?? '')}`
}

function freezeProjection(result) {
  const measures = Object.freeze((result.measures || []).map((measure) => Object.freeze({
    ...measure,
    groups: Object.freeze((measure.groups || []).map((group) => Object.freeze({
      ...group,
      events: Object.freeze((group.events || []).map((event) => Object.freeze({
        ...event,
        position: event.position ? Object.freeze({ ...event.position }) : null,
      }))),
    }))),
  })))

  return Object.freeze({ ...result, measures })
}

function terminalProjection(state, reason, blockingNoteIndex = null, searchNodes = 0) {
  return freezeProjection({
    state,
    reason,
    blockingNoteIndex,
    policyId: ADVANCED_GUITAR_TAB_POLICY_ID,
    provenance: ADVANCED_GUITAR_TAB_PROVENANCE,
    sourceFingeringClaimed: false,
    noteCount: 0,
    measureCount: 0,
    searchNodes,
    measures: [],
  })
}

function buildMeasures(notes) {
  const partKeys = new Set()
  const measureMap = new Map()
  const measures = []

  for (let noteIndex = 0; noteIndex < notes.length; noteIndex += 1) {
    const note = notes[noteIndex]
    if (!validatePhysicalIdentity(note)) {
      return { error: terminalProjection(ADVANCED_GUITAR_TAB_PROJECTION_STATE.INVALID, 'canonical-physical-identity-required', noteIndex) }
    }

    partKeys.add(physicalPartKey(note))
    if (partKeys.size > 1) {
      return { error: terminalProjection(ADVANCED_GUITAR_TAB_PROJECTION_STATE.INVALID, 'multiple-parts-not-supported', noteIndex) }
    }

    const candidates = enumerateCanonicalGuitarPositionCandidates(note)
    if (candidates.state === GUITAR_POSITION_CANDIDATE_STATE.INVALID) {
      return { error: terminalProjection(ADVANCED_GUITAR_TAB_PROJECTION_STATE.INVALID, candidates.reason || 'invalid-canonical-note', noteIndex) }
    }
    if (candidates.state === GUITAR_POSITION_CANDIDATE_STATE.UNPLAYABLE) {
      return { error: terminalProjection(ADVANCED_GUITAR_TAB_PROJECTION_STATE.UNPLAYABLE, candidates.reason || 'unplayable-note', noteIndex) }
    }

    let measure = measureMap.get(note.measureKey)
    if (!measure) {
      measure = {
        measureKey: note.measureKey,
        measureIndex: note.measureIndex,
        measureNumber: note.measureNumber ?? null,
        partId: note.partId,
        partIndex: note.partIndex,
        groupMap: new Map(),
        groups: [],
      }
      measureMap.set(note.measureKey, measure)
      measures.push(measure)
    } else if (
      measure.measureIndex !== note.measureIndex ||
      measure.partId !== note.partId ||
      measure.partIndex !== note.partIndex
    ) {
      return { error: terminalProjection(ADVANCED_GUITAR_TAB_PROJECTION_STATE.INVALID, 'conflicting-measure-identity', noteIndex) }
    }

    const onsetKey = String(note.startBeat)
    let group = measure.groupMap.get(onsetKey)
    if (!group) {
      group = {
        startBeat: note.startBeat,
        firstNoteIndex: noteIndex,
        events: [],
      }
      measure.groupMap.set(onsetKey, group)
      measure.groups.push(group)
    }

    group.events.push({
      noteIndex,
      note,
      isRest: note.isRest === true,
      isGrace: note.isGrace === true,
      tieStart: note.tieStart === true,
      tieStop: note.tieStop === true,
      beats: note.beats,
      writtenMidi: candidates.writtenMidi,
      candidates: candidates.candidates,
    })
  }

  for (const measure of measures) {
    measure.groups.sort((a, b) => (a.startBeat - b.startBeat) || (a.firstNoteIndex - b.firstNoteIndex))
    delete measure.groupMap
  }

  return { measures }
}

function combinationScore(entries) {
  if (entries.length === 0) return [0, 0, 0, '']
  const frets = entries.map((entry) => entry.position.fret)
  const minimum = Math.min(...frets)
  const maximum = Math.max(...frets)
  const sum = frets.reduce((total, fret) => total + fret, 0)
  const lexical = entries
    .slice()
    .sort((a, b) => a.event.noteIndex - b.event.noteIndex)
    .map((entry) => `${entry.position.stringNumber}:${String(entry.position.fret).padStart(2, '0')}`)
    .join('|')
  return [maximum - minimum, sum, maximum, lexical]
}

function compareScore(a, b) {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  return a[3].localeCompare(b[3])
}

function enumerateGroupCombinations(group, lockedStrings, tieLocks, counter) {
  const pitched = group.events.filter((event) => !event.isRest)
  if (pitched.length > 6) {
    return { reason: 'more-than-six-simultaneous-pitched-notes', combinations: [] }
  }

  const domains = []
  for (const event of pitched) {
    let domain = event.candidates
    if (event.tieStop) {
      const locked = tieLocks.get(tieKey(event))
      if (!locked) return { reason: 'tie-stop-without-established-position', combinations: [] }
      domain = domain.filter((candidate) =>
        candidate.stringNumber === locked.stringNumber && candidate.fret === locked.fret,
      )
      if (domain.length === 0) return { reason: 'tie-position-mismatch', combinations: [] }
    }
    domains.push({ event, domain })
  }

  domains.sort((a, b) => (a.domain.length - b.domain.length) || (a.event.noteIndex - b.event.noteIndex))
  const combinations = []
  const used = new Set(lockedStrings)
  const chosen = []

  function visit(index) {
    counter.count += 1
    if (counter.count > ADVANCED_GUITAR_TAB_MAX_SEARCH_NODES) return false
    if (index === domains.length) {
      const entries = chosen.map((entry) => ({ event: entry.event, position: entry.position }))
      combinations.push({ entries, score: combinationScore(entries) })
      return true
    }

    const { event, domain } = domains[index]
    for (const position of domain) {
      if (used.has(position.stringNumber)) continue
      used.add(position.stringNumber)
      chosen.push({ event, position })
      const keepGoing = visit(index + 1)
      chosen.pop()
      used.delete(position.stringNumber)
      if (!keepGoing) return false
    }
    return true
  }

  const completed = visit(0)
  if (!completed) return { reason: 'solver-search-limit', combinations: [] }
  combinations.sort((a, b) => compareScore(a.score, b.score))
  return { reason: combinations.length === 0 ? 'no-distinct-string-assignment' : null, combinations }
}

function solveAssignments(measures) {
  const groups = []
  for (let measureOrder = 0; measureOrder < measures.length; measureOrder += 1) {
    for (const group of measures[measureOrder].groups) {
      groups.push({ measureOrder, group })
    }
  }

  const counter = { count: 0 }
  const assignment = new Map()

  function recurse(groupIndex, active, tieLocks, currentMeasureOrder) {
    if (counter.count > ADVANCED_GUITAR_TAB_MAX_SEARCH_NODES) return { state: 'limit' }
    if (groupIndex >= groups.length) {
      if (tieLocks.size > 0) {
        const dangling = tieLocks.values().next().value
        return {
          state: 'blocked',
          reason: 'dangling-tie-start',
          noteIndex: dangling?.noteIndex ?? null,
        }
      }
      return { state: 'solved' }
    }

    const current = groups[groupIndex]
    const { group, measureOrder } = current
    const activeNow = measureOrder === currentMeasureOrder
      ? active.filter((entry) => entry.endBeat > group.startBeat)
      : []
    const lockedStrings = new Set(activeNow.map((entry) => entry.stringNumber))

    const generated = enumerateGroupCombinations(group, lockedStrings, tieLocks, counter)
    if (generated.reason === 'solver-search-limit') return { state: 'limit' }
    if (generated.combinations.length === 0) {
      return { state: 'blocked', reason: generated.reason || 'no-distinct-string-assignment', noteIndex: group.firstNoteIndex }
    }

    let firstBlocked = null
    for (const combination of generated.combinations) {
      const nextActive = activeNow.slice()
      const nextTieLocks = new Map(tieLocks)
      const touched = []

      for (const { event, position } of combination.entries) {
        assignment.set(event.noteIndex, position)
        touched.push(event.noteIndex)

        const key = tieKey(event)
        if (event.tieStop && !event.tieStart) nextTieLocks.delete(key)
        if (event.tieStart) {
          nextTieLocks.set(key, {
            stringNumber: position.stringNumber,
            fret: position.fret,
            noteIndex: event.noteIndex,
          })
        }

        if (!event.isGrace && event.beats > 0) {
          nextActive.push({
            stringNumber: position.stringNumber,
            endBeat: group.startBeat + event.beats,
            noteIndex: event.noteIndex,
          })
        }
      }

      const solved = recurse(groupIndex + 1, nextActive, nextTieLocks, measureOrder)
      if (solved.state === 'solved') return solved
      for (const noteIndex of touched) assignment.delete(noteIndex)
      if (solved.state === 'limit') return solved
      if (solved.state === 'blocked' && firstBlocked === null) firstBlocked = solved
    }

    return firstBlocked ?? {
      state: 'blocked',
      reason: 'no-sustained-string-assignment',
      noteIndex: group.firstNoteIndex,
    }
  }

  return {
    result: recurse(0, [], new Map(), -1),
    assignment,
    searchNodes: counter.count,
  }
}

/**
 * Project one canonical guitar part into deterministic advanced TAB events.
 * The solver supports chords, simultaneous attacks and sustained polyphony by
 * assigning every sounding note to a distinct currently available string.
 */
export function projectCanonicalNotesToAdvancedGuitarTab(notes) {
  if (!Array.isArray(notes)) {
    return terminalProjection(ADVANCED_GUITAR_TAB_PROJECTION_STATE.INVALID, 'canonical-note-array-required')
  }
  if (notes.length === 0) {
    return terminalProjection(ADVANCED_GUITAR_TAB_PROJECTION_STATE.INVALID, 'empty-note-array')
  }
  for (let index = 0; index < notes.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(notes, index)) {
      return terminalProjection(ADVANCED_GUITAR_TAB_PROJECTION_STATE.INVALID, 'sparse-note-array', index)
    }
  }

  const built = buildMeasures(notes)
  if (built.error) return built.error

  const solved = solveAssignments(built.measures)
  if (solved.result.state === 'limit') {
    return terminalProjection(
      ADVANCED_GUITAR_TAB_PROJECTION_STATE.COMPLEXITY_LIMIT,
      'solver-search-limit',
      null,
      solved.searchNodes,
    )
  }
  if (solved.result.state !== 'solved') {
    return terminalProjection(
      ADVANCED_GUITAR_TAB_PROJECTION_STATE.UNPLAYABLE,
      solved.result.reason || 'advanced-position-assignment-failed',
      solved.result.noteIndex ?? null,
      solved.searchNodes,
    )
  }

  const measures = built.measures.map((measure) => ({
    measureKey: measure.measureKey,
    measureIndex: measure.measureIndex,
    measureNumber: measure.measureNumber,
    partId: measure.partId,
    partIndex: measure.partIndex,
    groups: measure.groups.map((group) => ({
      startBeat: group.startBeat,
      events: group.events.map((event) => ({
        noteIndex: event.noteIndex,
        note: event.note,
        measureKey: event.note.measureKey,
        measureIndex: event.note.measureIndex,
        startBeat: event.note.startBeat,
        beats: event.note.beats,
        voice: event.note.voice ?? null,
        staff: event.note.staff ?? null,
        isRest: event.isRest,
        isGrace: event.isGrace,
        isChordNote: event.note.isChordNote === true,
        tieStart: event.tieStart,
        tieStop: event.tieStop,
        policyId: ADVANCED_GUITAR_TAB_POLICY_ID,
        provenance: ADVANCED_GUITAR_TAB_PROVENANCE,
        sourceFingeringClaimed: false,
        position: event.isRest ? null : solved.assignment.get(event.noteIndex) ?? null,
      })),
    })),
  }))

  return freezeProjection({
    state: ADVANCED_GUITAR_TAB_PROJECTION_STATE.PROJECTED,
    reason: null,
    blockingNoteIndex: null,
    policyId: ADVANCED_GUITAR_TAB_POLICY_ID,
    provenance: ADVANCED_GUITAR_TAB_PROVENANCE,
    sourceFingeringClaimed: false,
    noteCount: notes.length,
    measureCount: measures.length,
    searchNodes: solved.searchNodes,
    measures,
  })
}
