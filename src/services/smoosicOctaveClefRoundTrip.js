import { inspectMusicXml } from '../../musicXmlSecurity.js'

export const SMOOSIC_ROUND_TRIP_PROVENANCE_VERSION = 1

const PROVENANCE_KIND = 'smoosic-octave-clef-display-compensation'
const SHA256 = /^[0-9a-f]{64}$/u

function directChildren(element, name) {
  return [...(element?.children ?? [])].filter(
    (child) => (child.localName ?? child.tagName) === name,
  )
}

function directChild(element, name) {
  return directChildren(element, name)[0] ?? null
}

function strictIntegerText(element, label) {
  const text = String(element?.textContent ?? '').trim()
  if (!/^-?(0|[1-9][0-9]*)$/u.test(text)) {
    throw new Error(`Invalid ${label}.`)
  }
  const value = Number(text)
  if (!Number.isSafeInteger(value)) throw new Error(`Invalid ${label}.`)
  return value
}

function positiveIdentity(element, name, fallback = null) {
  const child = directChild(element, name)
  if (!child) return fallback
  const value = strictIntegerText(child, `${name} identity`)
  if (value <= 0) throw new Error(`Invalid ${name} identity.`)
  return value
}

function numberedContext(element, label) {
  const raw = element?.getAttribute?.('number')
  if (raw === null || raw === undefined || raw === '') return 1
  if (!/^[1-9][0-9]*$/u.test(raw)) throw new Error(`Invalid ${label} number.`)
  const value = Number(raw)
  if (!Number.isSafeInteger(value)) throw new Error(`Invalid ${label} number.`)
  return value
}

function removeElement(element) {
  if (typeof element?.remove === 'function') {
    element.remove()
    return
  }
  const parent = element?.parentNode
  const index = parent?.childNodes?.indexOf?.(element) ?? -1
  if (index < 0) throw new Error('MusicXML element cannot be removed safely.')
  parent.childNodes.splice(index, 1)
  element.parentNode = null
}

function replaceOrAppend(parent, existing, replacement) {
  const clone = replacement.cloneNode(true)
  if (existing) parent.replaceChild(clone, existing)
  else parent.appendChild(clone)
}

function parseScore(musicXml, DOMParserCtor) {
  if (typeof musicXml !== 'string' || !inspectMusicXml(musicXml).ok) {
    throw new Error('Smoosic round-trip requires valid bounded MusicXML.')
  }
  if (typeof DOMParserCtor !== 'function') {
    throw new Error('Smoosic round-trip DOM parser is unavailable.')
  }
  const doc = new DOMParserCtor().parseFromString(musicXml, 'text/xml')
  if (doc?.querySelector?.('parsererror')) throw new Error('MusicXML parse failed.')
  const score = doc?.documentElement
  if ((score?.localName ?? score?.tagName) !== 'score-partwise') {
    throw new Error('Smoosic round-trip requires score-partwise MusicXML.')
  }
  return { doc, score }
}

function serialize(value, XMLSerializerCtor) {
  if (typeof XMLSerializerCtor !== 'function') {
    throw new Error('Smoosic round-trip XML serializer is unavailable.')
  }
  return new XMLSerializerCtor().serializeToString(value)
}

function hex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256(value, cryptoScope) {
  const subtle = cryptoScope?.subtle
  if (!subtle || typeof subtle.digest !== 'function') {
    throw new Error('WebCrypto SHA-256 is unavailable for Smoosic lineage.')
  }
  return hex(await subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

function freezeProvenance(value) {
  return Object.freeze({
    ...value,
    compensations: Object.freeze(value.compensations.map((item) => Object.freeze({ ...item }))),
    clefContexts: Object.freeze(value.clefContexts.map((item) => Object.freeze({ ...item }))),
    transposeContexts: Object.freeze(value.transposeContexts.map((item) => Object.freeze({ ...item }))),
  })
}

function analyzeAndDerive({ doc, score, XMLSerializerCtor }) {
  const parts = directChildren(score, 'part')
  if (parts.length === 0) throw new Error('Smoosic round-trip requires at least one part.')
  const partIds = new Set()
  const compensations = []
  const clefContexts = []
  const transposeContexts = []

  for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
    const part = parts[partIndex]
    const partId = String(part.getAttribute?.('id') ?? '')
    if (!partId || partIds.has(partId)) throw new Error('Ambiguous MusicXML part identity.')
    partIds.add(partId)
    const activeCompensation = new Map()
    const measures = directChildren(part, 'measure')

    for (let measureIndex = 0; measureIndex < measures.length; measureIndex += 1) {
      const measure = measures[measureIndex]
      const attributes = directChildren(measure, 'attributes')
      if (attributes.length > 1) throw new Error('Ambiguous MusicXML attributes context.')
      const attributesElement = attributes[0] ?? null

      for (const clef of directChildren(attributesElement, 'clef')) {
        const staff = numberedContext(clef, 'clef staff')
        const octaveElement = directChild(clef, 'clef-octave-change')
        if (!octaveElement) {
          activeCompensation.set(staff, 0)
          continue
        }
        const octaveChange = strictIntegerText(octaveElement, 'clef-octave-change')
        const sign = String(directChild(clef, 'sign')?.textContent ?? '').trim()
        const line = positiveIdentity(clef, 'line')
        if (octaveChange === 0) {
          activeCompensation.set(staff, 0)
          removeElement(octaveElement)
          continue
        }
        if (sign !== 'G' || line !== 2 || Math.abs(octaveChange) !== 1) {
          throw new Error('Unsupported octave-clef display context.')
        }
        const semitones = -12 * octaveChange
        clefContexts.push({
          partId,
          partIndex,
          measureIndex,
          staff,
          sourceXml: serialize(clef, XMLSerializerCtor),
        })
        activeCompensation.set(staff, semitones)
        removeElement(octaveElement)
      }

      for (const transpose of directChildren(attributesElement, 'transpose')) {
        const staff = numberedContext(transpose, 'transpose staff')
        if (transposeContexts.some((item) => (
          item.partIndex === partIndex
          && item.measureIndex === measureIndex
          && item.staff === staff
        ))) {
          throw new Error('Ambiguous MusicXML transpose context.')
        }
        transposeContexts.push({
          partId,
          partIndex,
          measureIndex,
          staff,
          sourceXml: serialize(transpose, XMLSerializerCtor),
        })
      }

      const notes = directChildren(measure, 'note')
      for (let noteIndex = 0; noteIndex < notes.length; noteIndex += 1) {
        const note = notes[noteIndex]
        const pitch = directChild(note, 'pitch')
        if (!pitch) continue
        const staff = positiveIdentity(note, 'staff', 1)
        const voice = positiveIdentity(note, 'voice')
        if (voice === null) throw new Error('Pitched MusicXML note requires exact voice identity.')
        const semitones = activeCompensation.get(staff) ?? 0
        if (semitones === 0) continue
        const octave = directChild(pitch, 'octave')
        if (!octave) throw new Error('Pitched MusicXML note requires octave.')
        const sourceOctave = strictIntegerText(octave, 'pitch octave')
        octave.textContent = String(sourceOctave + (semitones / 12))
        compensations.push({
          partId,
          partIndex,
          measureIndex,
          noteIndex,
          staff,
          voice,
          semitones,
        })
      }
    }
  }

  return { doc, compensations, clefContexts, transposeContexts }
}

export async function createSmoosicRoundTripWorkingCopy({
  musicXml,
  sourceRevision,
  DOMParserCtor = globalThis.DOMParser,
  XMLSerializerCtor = globalThis.XMLSerializer,
  cryptoScope = globalThis.crypto,
} = {}) {
  if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 0) {
    throw new Error('Smoosic source revision must be a non-negative integer.')
  }
  const parsed = parseScore(musicXml, DOMParserCtor)
  const derived = analyzeAndDerive({ ...parsed, XMLSerializerCtor })
  const requiresDerivedCopy = derived.compensations.length > 0
    || derived.clefContexts.length > 0
    || derived.transposeContexts.length > 0
  if (!requiresDerivedCopy) {
    return Object.freeze({ kind: 'DIRECT', musicXml, provenance: null })
  }

  const workingMusicXml = serialize(derived.doc, XMLSerializerCtor)
  const provenance = freezeProvenance({
    schemaVersion: SMOOSIC_ROUND_TRIP_PROVENANCE_VERSION,
    kind: PROVENANCE_KIND,
    sourceRevision,
    sourceSha256: await sha256(musicXml, cryptoScope),
    workingSha256: await sha256(workingMusicXml, cryptoScope),
    compensations: derived.compensations,
    clefContexts: derived.clefContexts,
    transposeContexts: derived.transposeContexts,
  })
  return Object.freeze({
    kind: 'DERIVED',
    musicXml: workingMusicXml,
    provenance,
  })
}

function validateProvenance(provenance, sourceRevision) {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
    throw new Error('Smoosic round-trip provenance is required.')
  }
  if (
    provenance.schemaVersion !== SMOOSIC_ROUND_TRIP_PROVENANCE_VERSION
    || provenance.kind !== PROVENANCE_KIND
    || provenance.sourceRevision !== sourceRevision
    || !SHA256.test(provenance.sourceSha256 ?? '')
    || !SHA256.test(provenance.workingSha256 ?? '')
    || !Array.isArray(provenance.compensations)
    || !Array.isArray(provenance.clefContexts)
    || !Array.isArray(provenance.transposeContexts)
  ) {
    throw new Error('Smoosic source revision or provenance is invalid.')
  }
}

function contextKey(item) {
  return JSON.stringify([item.partIndex, item.measureIndex, item.staff])
}

function sameEvidence(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function candidateTopology(score) {
  return directChildren(score, 'part').map((part, partIndex) => ({
    part,
    partIndex,
    partId: String(part.getAttribute?.('id') ?? ''),
    measures: directChildren(part, 'measure').map((measure, measureIndex) => ({
      measure,
      measureIndex,
      notes: directChildren(measure, 'note'),
    })),
  }))
}

function restoreContext({ topology, context, name, DOMParserCtor }) {
  const targetPart = topology[context.partIndex]
  if (!targetPart || targetPart.partId !== context.partId) {
    throw new Error(`Smoosic ${name} part identity drifted.`)
  }
  const targetMeasure = targetPart.measures?.[context.measureIndex]?.measure
  if (!targetMeasure) throw new Error(`Smoosic ${name} lineage is incomplete.`)
  const attributes = directChildren(targetMeasure, 'attributes')
  if (attributes.length !== 1) throw new Error(`Smoosic ${name} context is ambiguous.`)
  const parent = attributes[0]
  const existing = directChildren(parent, name)
    .filter((element) => numberedContext(element, `${name} staff`) === context.staff)
  if (existing.length > 1) throw new Error(`Smoosic ${name} context is ambiguous.`)
  const sourceElement = new DOMParserCtor()
    .parseFromString(`<root>${context.sourceXml}</root>`, 'text/xml')
    .documentElement
    ?.children?.[0]
  if (!sourceElement) throw new Error(`Smoosic ${name} provenance is invalid.`)
  replaceOrAppend(parent, existing[0] ?? null, sourceElement)
}

export async function restoreSmoosicRoundTripCandidate({
  sourceMusicXml,
  candidateMusicXml,
  provenance,
  sourceRevision,
  DOMParserCtor = globalThis.DOMParser,
  XMLSerializerCtor = globalThis.XMLSerializer,
  cryptoScope = globalThis.crypto,
} = {}) {
  validateProvenance(provenance, sourceRevision)
  const sourceSha256 = await sha256(sourceMusicXml, cryptoScope)
  if (sourceSha256 !== provenance.sourceSha256) {
    throw new Error('Smoosic source hash does not match provenance.')
  }

  const expected = await createSmoosicRoundTripWorkingCopy({
    musicXml: sourceMusicXml,
    sourceRevision,
    DOMParserCtor,
    XMLSerializerCtor,
    cryptoScope,
  })
  if (
    expected.kind !== 'DERIVED'
    || expected.provenance.workingSha256 !== provenance.workingSha256
    || !sameEvidence(expected.provenance.compensations, provenance.compensations)
    || !sameEvidence(expected.provenance.clefContexts, provenance.clefContexts)
    || !sameEvidence(expected.provenance.transposeContexts, provenance.transposeContexts)
  ) {
    throw new Error('Smoosic round-trip provenance does not match the source.')
  }

  const parsed = parseScore(candidateMusicXml, DOMParserCtor)
  const topology = candidateTopology(parsed.score)
  const sourceTopology = candidateTopology(parseScore(sourceMusicXml, DOMParserCtor).score)
  const candidatePartIds = topology.map((part) => part.partId)
  if (
    topology.length !== sourceTopology.length
    || candidatePartIds.some((partId) => !partId)
    || new Set(candidatePartIds).size !== candidatePartIds.length
    || topology.some((part, partIndex) => part.partId !== sourceTopology[partIndex].partId)
  ) {
    throw new Error('Smoosic part identity drifted.')
  }
  if (
    topology.some((part, partIndex) => (
      part.measures.length !== sourceTopology[partIndex].measures.length
      || part.measures.some((measure, measureIndex) => (
        measure.notes.length !== sourceTopology[partIndex].measures[measureIndex].notes.length
      ))
    ))
  ) {
    throw new Error('Smoosic note cardinality or measure lineage changed.')
  }

  for (const compensation of provenance.compensations) {
    const candidatePart = topology[compensation.partIndex]
    if (!candidatePart || candidatePart.partId !== compensation.partId) {
      throw new Error('Smoosic part identity drifted.')
    }
    const note = candidatePart
      ?.measures?.[compensation.measureIndex]
      ?.notes?.[compensation.noteIndex]
    if (!note) throw new Error('Smoosic compensated note lineage is incomplete.')
    const staff = positiveIdentity(note, 'staff', 1)
    if (staff !== compensation.staff) throw new Error('Smoosic staff identity drifted.')
    const voice = positiveIdentity(note, 'voice')
    if (voice === null || voice !== compensation.voice) {
      throw new Error('Smoosic voice identity drifted.')
    }
    const pitch = directChild(note, 'pitch')
    const octave = directChild(pitch, 'octave')
    if (!pitch || !octave || Math.abs(compensation.semitones) !== 12) {
      throw new Error('Smoosic compensated pitch is invalid.')
    }
    octave.textContent = String(
      strictIntegerText(octave, 'candidate pitch octave') - (compensation.semitones / 12),
    )
  }

  const occupiedClefs = new Set()
  for (const context of provenance.clefContexts) {
    const key = contextKey(context)
    if (occupiedClefs.has(key)) throw new Error('Smoosic clef provenance is ambiguous.')
    occupiedClefs.add(key)
    restoreContext({ topology, context, name: 'clef', DOMParserCtor })
  }
  const occupiedTransposes = new Set()
  for (const context of provenance.transposeContexts) {
    const key = contextKey(context)
    if (occupiedTransposes.has(key)) throw new Error('Smoosic transpose provenance is ambiguous.')
    occupiedTransposes.add(key)
    restoreContext({ topology, context, name: 'transpose', DOMParserCtor })
  }

  return Object.freeze({
    musicXml: serialize(parsed.doc, XMLSerializerCtor),
    restoredCompensationCount: provenance.compensations.length,
  })
}
