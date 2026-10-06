import { deriveScoreNoteRefForCanonicalNote } from './scoreNoteIdentity.js'

function normalizePartId(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && trimmed === value ? trimmed : null
}

function normalizeNonNegativeInteger(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return Number.isSafeInteger(number) && number >= 0 ? number : null
}

function normalizePositiveInteger(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return Number.isSafeInteger(number) && number >= 1 ? number : null
}

function normalizeBeat(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return Object.is(value, -0) ? 0 : value
}

function sourceBeat(event) {
  const onset = normalizeNonNegativeInteger(event?.onsetDivisions)
  const divisions = normalizePositiveInteger(event?.divisions)
  if (onset === null || divisions === null) return null
  return normalizeBeat(onset / divisions)
}

function bucketKey({ partId, measureIndex, voice, staff, beat }) {
  return `${partId}\u0000${measureIndex}\u0000${voice}\u0000${staff}\u0000${String(beat)}`
}

function sourceRecord(event) {
  if (!event || typeof event !== 'object') return null
  const sourceEventId = typeof event.sourceEventId === 'string' && event.sourceEventId ? event.sourceEventId : null
  const partId = normalizePartId(event.partId)
  const measureIndex = normalizeNonNegativeInteger(event.measureIndex)
  const voice = normalizeNonNegativeInteger(event.voice)
  const staff = normalizePositiveInteger(event.staff)
  const beat = sourceBeat(event)
  const sourceOrder = normalizeNonNegativeInteger(event.sourceOrder)
  if (!sourceEventId || !partId || measureIndex === null || voice === null || staff === null || beat === null || sourceOrder === null) {
    return null
  }
  return { event, sourceEventId, partId, measureIndex, voice, staff, beat, sourceOrder }
}

function canonicalRecord(note, globalIndex) {
  if (!note || typeof note !== 'object' || note.isRest === true) return null
  const partId = normalizePartId(note.partId)
  const measureIndex = normalizeNonNegativeInteger(note.measureIndex)
  const voice = normalizeNonNegativeInteger(note.voice)
  const staff = normalizePositiveInteger(note.staff)
  const beat = normalizeBeat(note.startBeat)
  if (!partId || measureIndex === null || voice === null || staff === null || beat === null) return null
  return { note, globalIndex, partId, measureIndex, voice, staff, beat }
}

function addBucket(map, key, record) {
  const records = map.get(key)
  if (records) records.push(record)
  else map.set(key, [record])
}

export function createGuitarTabRendererTargetResolver(sourceSession, canonicalNotes) {
  const empty = Object.freeze({
    matchedCount: 0,
    resolve() { return null },
  })

  if (!sourceSession || !Array.isArray(sourceSession.events) || !Array.isArray(canonicalNotes)) return empty

  const sourceBuckets = new Map()
  const canonicalBuckets = new Map()
  const seenSourceEventIds = new Set()

  for (const event of sourceSession.events) {
    const record = sourceRecord(event)
    if (!record || seenSourceEventIds.has(record.sourceEventId)) return empty
    seenSourceEventIds.add(record.sourceEventId)
    addBucket(sourceBuckets, bucketKey(record), record)
  }

  for (let globalIndex = 0; globalIndex < canonicalNotes.length; globalIndex += 1) {
    const record = canonicalRecord(canonicalNotes[globalIndex], globalIndex)
    if (!record) continue
    addBucket(canonicalBuckets, bucketKey(record), record)
  }

  const targets = new Map()
  for (const [key, sourceRecords] of sourceBuckets) {
    const canonicalRecords = canonicalBuckets.get(key)
    if (!canonicalRecords || canonicalRecords.length !== sourceRecords.length) continue

    sourceRecords.sort((a, b) => a.sourceOrder - b.sourceOrder)
    canonicalRecords.sort((a, b) => a.globalIndex - b.globalIndex)

    let bucketValid = true
    const pending = []
    for (let index = 0; index < sourceRecords.length; index += 1) {
      const target = deriveScoreNoteRefForCanonicalNote(canonicalNotes, canonicalRecords[index].globalIndex)
      if (!target) {
        bucketValid = false
        break
      }
      pending.push([sourceRecords[index].sourceEventId, target])
    }
    if (!bucketValid) continue
    for (const [sourceEventId, target] of pending) targets.set(sourceEventId, target)
  }

  return Object.freeze({
    matchedCount: targets.size,
    resolve(sourceEventId) {
      return targets.get(sourceEventId) ?? null
    },
  })
}
