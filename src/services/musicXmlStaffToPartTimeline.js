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
function checkLinks(note, staff, links, measure) {
  const voice = splitText(note, 'voice') || '1'
  const visit = node => {
    for (const child of splitChildren(node)) {
      const name = splitName(child)
      if (['glissando', 'slide', 'hammer-on', 'pull-off'].includes(name)) splitFailure('unsupported-note-span', measure)
      const type = name === 'beam' ? child.textContent.trim() : child.getAttribute('type')
      if (['beam', 'slur', 'tuplet', 'tie'].includes(name)) {
        const number = child.getAttribute('number') || '1'
        const pitch = name === 'tie' ? splitText(splitChild(note, 'pitch'), 'step') + ':' + splitText(splitChild(note, 'pitch'), 'alter') + ':' + splitText(splitChild(note, 'pitch'), 'octave') : ''
        const key = name + ':' + number + ':' + (name === 'beam' ? voice : '') + ':' + pitch
        if (['start', 'begin'].includes(type)) {
          if (links.has(key) && links.get(key) !== staff) splitFailure('cross-staff-link', measure)
          links.set(key, staff)
        } else if (['stop', 'end', 'continue'].includes(type) && links.has(key)) {
          if (links.get(key) !== staff) splitFailure('cross-staff-link', measure)
          if (type !== 'continue') links.delete(key)
        }
      }
      visit(child)
    }
  }
  visit(note)
}
function inspectNote(node, state, allowed, measure, links) {
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
  checkLinks(node, staff, links, measure)
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
        records.push(inspectNote(node, state, allowed, number, links))
        continue
      }
      // Instrument changes, cross-staff identifiers and layout with staff-local
      // dependencies need a separate conversion capability, not a guess.
      if (kind === 'print') {
        if (splitChildren(node).some(child => splitName(child) === 'staff-layout')) splitFailure('unsupported-staff-layout', number)
      }
      if (node.getElementsByTagName?.('midi-instrument')?.length || node.getElementsByTagName?.('instrument-change')?.length) splitFailure('unsupported-instrument-change', number)
      records.push({ node, kind, onset: state.cursor, staff: splitStaff(node, allowed, false) })
    }
    if (state.extent <= 0) splitFailure('empty-measure', number)
    return { node: measure, number, records, extent: state.extent, divisions: state.divisions }
  })
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
