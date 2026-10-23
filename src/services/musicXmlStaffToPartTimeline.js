// Bounded admission and timing evidence for SES-248. No musical correction.
export const splitChildren = (node, name = null) =>
  Array.from(node?.childNodes ?? []).filter(child => child.nodeType === 1 &&
    (name === null || splitName(child) === name))
export const splitName = node => node?.localName ?? node?.tagName
export const splitChild = (node, name) => splitChildren(node, name)[0] ?? null
export const splitText = (node, name) => splitChild(node, name)?.textContent?.trim() ?? ''
const EPSILON = 1e-8
const MAX_EVENTS = 100_000
const MEASURE_ELEMENTS = new Set(['attributes', 'note', 'backup', 'forward', 'direction', 'sound', 'harmony', 'barline', 'print'])
const ATTRIBUTE_ELEMENTS = new Set(['divisions', 'key', 'time', 'staves', 'clef', 'transpose'])
const GLOBAL_DIRECTION_CHILDREN = new Set(['direction-type', 'offset', 'footnote', 'level', 'sound'])
const SYSTEM_DIRECTION_TYPES = new Set(['metronome', 'words', 'rehearsal', 'segno', 'coda'])

function globalTempoSound(node) {
  const attributes = node.getAttributeNames()
  return attributes.includes('tempo') && attributes.every(name => ['tempo', 'time-only', 'id'].includes(name)) &&
    splitChildren(node).every(child => splitName(child) === 'offset')
}
function globalDirection(node) {
  const types = splitChildren(node, 'direction-type').flatMap(container => splitChildren(container))
  const systemOnly = node.getAttribute('system') === 'only-top'
  return types.length > 0 && types.every(child => systemOnly
    ? SYSTEM_DIRECTION_TYPES.has(splitName(child)) : splitName(child) === 'metronome') &&
    splitChildren(node).every(child => GLOBAL_DIRECTION_CHILDREN.has(splitName(child))) &&
    splitChildren(node, 'sound').every(globalTempoSound)
}
function metadataStaff(node, kind, allowed, measure) {
  const staff = splitStaff(node, allowed, false)
  // Missing staff is not evidence of global scope. Admit known global tempo
  // and explicit system-only directions, never staff-local instructions by guess.
  if (allowed.length > 1 && staff === null &&
    (kind === 'harmony' || (kind === 'direction' && !globalDirection(node)) ||
      (kind === 'sound' && !globalTempoSound(node)))) splitFailure('staff-ambiguous-' + kind, measure)
  return staff
}

export function splitFailure(reason, measure = null) {
  const error = new Error('staff-split-' + (measure === null ? '' : 'measure-' + measure + '-') + reason)
  error.code = reason
  error.measure = measure
  throw error
}
export function splitStaff(node, allowed, required = true) {
  const raw = splitText(node, 'staff')
  if (!raw && !required) return null
  const staff = Number(raw)
  if (!/^[1-2]$/.test(raw) || !allowed.includes(staff) || splitChildren(node, 'staff').length !== 1) splitFailure('staff-ambiguous')
  return staff
}
function positive(node, name, measure) {
  const raw = splitText(node, name)
  const value = Number(raw)
  if (!raw || !Number.isFinite(value) || value <= 0) splitFailure('invalid-' + name, measure)
  return value
}
function checkAttributes(node, state, cursor, allowed, measure) {
  if (Math.abs(cursor) > EPSILON) splitFailure('unsupported-mid-measure-attributes', measure)
  for (const item of splitChildren(node)) {
    const name = splitName(item)
    if (!ATTRIBUTE_ELEMENTS.has(name)) splitFailure('unsupported-attributes', measure)
    const number = item.getAttribute('number')
    if (number !== null && number !== '' && !allowed.includes(Number(number))) splitFailure('staff-attributes', measure)
    if (name === 'divisions') {
      state.divisions = Number(item.textContent)
      if (!Number.isSafeInteger(state.divisions) || state.divisions <= 0) splitFailure('invalid-divisions', measure)
    }
    if (name === 'staves' && Number(item.textContent) !== allowed.length) splitFailure('staff-topology', measure)
  }
}
function spanPitch(note, measure) {
  const pitch = splitChild(note, 'pitch')
  const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[splitText(pitch, 'step')]
  const value = (Number(splitText(pitch, 'octave')) + 1) * 12 + semitone + Number(splitText(pitch, 'alter') || 0)
  if (!Number.isFinite(value)) splitFailure('unsupported-note-span-pitch', measure)
  return value
}
function noteSpan(node, note, measure) {
  const name = splitName(node)
  if (['glissando', 'slide', 'hammer-on', 'pull-off'].includes(name)) splitFailure('unsupported-note-span', measure)
  if (!['beam', 'slur', 'tuplet', 'tie', 'tied'].includes(name)) return null
  const type = name === 'beam' ? node.textContent.trim() : node.getAttribute('type')
  if (name === 'beam' && ['forward hook', 'backward hook'].includes(type)) return null
  if (name === 'tied' && type === 'let-ring') return null
  const endpoint = type === 'begin' ? 'start' : type === 'end' ? 'stop' : type
  if (!['start', 'stop', 'continue'].includes(endpoint)) splitFailure('unsupported-note-span', measure)
  const voice = splitText(note, 'voice') || '1'
  const number = node.getAttribute('number') || '1'
  const pitch = ['tie', 'tied'].includes(name) ? spanPitch(note, measure) : ''
  return { type: endpoint, key: name + ':' + number + ':' + (['beam', 'tie'].includes(name) ? voice : '') + ':' + pitch }
}
function checkLinks(note, staff, links, measure, index, onset) {
  const visit = node => {
    for (const child of splitChildren(node)) {
      const span = noteSpan(child, note, measure)
      if (span) {
        if (!links.has(span.key)) links.set(span.key, [])
        links.get(span.key).push({ type: span.type, index, onset, staff, measure })
      }
      visit(child)
    }
  }
  visit(note)
}
const compareSpanTime = (a, b) => a.index - b.index || a.onset - b.onset
function verifyNoteSpanPair(first, second, continuations) {
  const start = first.type === 'start' ? first : second
  const stop = first.type === 'stop' ? first : second
  if ([first, ...continuations, second].some(point => point.staff !== start.staff)) splitFailure('cross-staff-link', second.measure)
  if (compareSpanTime(start, stop) > EPSILON || continuations.some(point =>
    compareSpanTime(point, start) < -EPSILON || compareSpanTime(point, stop) > EPSILON)) splitFailure('unsupported-note-span-order', second.measure)
  return { start, stop }
}
function verifyNoteSpanContinuations(spans, continuations) {
  const points = spans.flatMap(span => [
    { ...span.start, onset: span.start.onset - EPSILON, action: 0, span },
    { ...span.stop, onset: span.stop.onset + EPSILON, action: 2, span },
  ])
  points.push(...continuations.map(point => ({ ...point, action: 1 })))
  points.sort((a, b) => compareSpanTime(a, b) || a.action - b.action)
  const active = new Set()
  for (const point of points) {
    if (point.action === 0) active.add(point.span)
    else if (point.action === 2) active.delete(point.span)
    else {
      if (active.size !== 1) splitFailure('unsupported-unmatched-note-span', point.measure)
      if (active.values().next().value.start.staff !== point.staff) splitFailure('cross-staff-link', point.measure)
    }
  }
}
function verifyNoteSpans(links) {
  for (const events of links.values()) {
    let pending = null, attached = []
    const spans = [], continuations = []
    // Numbers may be reused by spans that overlap in score time but not XML
    // order. Pair both start/stop orientations before validating score times.
    for (const event of events) {
      if (event.type === 'continue') { (pending ? attached : continuations).push(event); continue }
      if (!pending) { pending = event; continue }
      if (pending.type === event.type) splitFailure('unsupported-overlapping-note-span', event.measure)
      spans.push(verifyNoteSpanPair(pending, event, attached))
      pending = null;attached = []
    }
    if (pending) splitFailure('unsupported-unmatched-note-span', pending.measure)
    if (continuations.length) verifyNoteSpanContinuations(spans, continuations)
  }
}
function inspectNote(node, state, allowed, measure, links, index) {
  if (splitChild(node, 'grace') || splitChild(node, 'unpitched')) splitFailure('unsupported-note', measure)
  const staff = splitStaff(node, allowed)
  const duration = positive(node, 'duration', measure) / state.divisions
  const chord = splitChild(node, 'chord') !== null
  const voice = splitText(node, 'voice') || '1'
  if (chord && (!state.anchor || state.anchor.staff !== staff || state.anchor.voice !== voice)) splitFailure('cross-staff-chord', measure)
  if (chord && duration > state.anchor.duration + EPSILON) splitFailure('unsupported-chord-duration', measure)
  const onset = chord ? state.anchor.onset : state.cursor
  const pitched = splitChild(node, 'pitch') !== null
  if (!pitched && !splitChild(node, 'rest')) splitFailure('unsupported-note', measure)
  if (pitched && staff === 1 && allowed.length === 2) {
    if (state.violinEnds.some(end => end > onset + EPSILON)) splitFailure('polyphonic-violin', measure)
    state.violinEnds.push(onset + duration)
  }
  checkLinks(node, staff, links, measure, index, onset)
  if (!chord) {
    state.anchor = { onset, staff, voice, duration }
    state.cursor += duration
  }
  state.extent = Math.max(state.extent, onset + duration)
  return { node, kind: 'note', onset, duration, staff, chord, pitched }
}
export function inspectSplitPart(part, allowed) {
  const state = { divisions: null }
  const links = new Map()
  let count = 0
  const measures = splitChildren(part, 'measure')
  if (!measures.length || measures.length > 10_000) splitFailure('measure-limit')
  const timeline = measures.map((measure, index) => {
    const number = measure.getAttribute('number') || String(index + 1)
    Object.assign(state, { cursor: 0, extent: 0, anchor: null, violinEnds: [] })
    const records = []
    for (const node of splitChildren(measure)) {
      if (++count > MAX_EVENTS) splitFailure('event-limit')
      const kind = splitName(node)
      if (!MEASURE_ELEMENTS.has(kind)) splitFailure('unsupported-measure-element', number)
      if (kind === 'attributes') {
        checkAttributes(node, state, state.cursor, allowed, number)
        records.push({ node, kind, onset: state.cursor, divisions: state.divisions })
        continue
      }
      if (kind === 'note' || kind === 'backup' || kind === 'forward') {
        if (state.divisions === null) splitFailure('missing-divisions', number)
      }
      if (kind === 'backup' || kind === 'forward') {
        const duration = positive(node, 'duration', number) / state.divisions
        state.cursor += kind === 'backup' ? -duration : duration
        if (state.cursor < -EPSILON) splitFailure('negative-cursor', number)
        state.cursor = Math.max(0, state.cursor)
        if (kind === 'forward') state.extent = Math.max(state.extent, state.cursor)
        continue
      }
      if (kind === 'note') {
        records.push(inspectNote(node, state, allowed, number, links, index))
        continue
      }
      // Instrument changes, cross-staff identifiers and layout with staff-local
      // dependencies need a separate conversion capability, not a guess.
      if (kind === 'print') {
        if (splitChildren(node).some(child => splitName(child) === 'staff-layout')) splitFailure('unsupported-staff-layout', number)
      }
      if (node.getElementsByTagName?.('midi-instrument')?.length || node.getElementsByTagName?.('instrument-change')?.length) splitFailure('unsupported-instrument-change', number)
      records.push({ node, kind, onset: state.cursor, staff: metadataStaff(node, kind, allowed, number) })
    }
    if (state.extent <= 0) splitFailure('empty-measure', number)
    return { node: measure, number, records, extent: state.extent, divisions: state.divisions }
  })
  verifyNoteSpans(links)
  verifyDirectionSpans(timeline)
  return timeline
}

function verifyDirectionSpans(timeline) {
  const events = []
  timeline.forEach((measure, index) => {
    for (const record of measure.records.filter(item => item.kind === 'direction')) {
      const offset = splitText(record.node, 'offset')
      const beat = record.onset + (offset ? Number(offset) / measure.divisions : 0)
      if (!Number.isFinite(beat)) splitFailure('unsupported-direction-offset', measure.number)
      for (const container of splitChildren(record.node, 'direction-type')) {
        for (const child of splitChildren(container)) {
          const kind = splitName(child)
          if (['pedal', 'octave-shift', 'bracket', 'dashes', 'wavy-line'].includes(kind)) splitFailure('unsupported-direction-span', measure.number)
          if (kind !== 'wedge') continue
          const type = child.getAttribute('type')
          if (!['crescendo', 'diminuendo', 'stop', 'continue'].includes(type)) splitFailure('unsupported-direction-span', measure.number)
          events.push({ index, beat, type, staff: record.staff, number: child.getAttribute('number') || '1', measure: measure.number })
        }
      }
    }
  })
  // XML voice order is not musical time order. Inspect endpoints in score time.
  events.sort((a, b) => a.index - b.index || a.beat - b.beat || Number(b.type === 'stop') - Number(a.type === 'stop'))
  const active = new Map()
  for (const event of events) {
    const previous = active.get(event.number)
    if (previous && previous.staff !== event.staff) splitFailure('cross-staff-direction-span', event.measure)
    if (['crescendo', 'diminuendo'].includes(event.type)) {
      if (previous) splitFailure('unsupported-overlapping-direction-span', event.measure)
      active.set(event.number, event)
    } else {
      if (!previous) splitFailure('unsupported-unmatched-direction-span', event.measure)
      if (event.type === 'stop') active.delete(event.number)
    }
  }
  if (active.size) splitFailure('unsupported-unclosed-direction-span')
}
