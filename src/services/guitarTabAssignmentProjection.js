function frozenEmptyProjection() {
  return Object.freeze({
    total: 0,
    assigned: 0,
    remaining: 0,
    invalid: 0,
    measures: Object.freeze([]),
  })
}

function validString(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= 6
}

function validFret(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 20
}

function eventRecord(event) {
  if (!event || typeof event !== 'object') return null
  const sourceEventId = typeof event.sourceEventId === 'string' && event.sourceEventId ? event.sourceEventId : null
  const measureIndex = Number.isSafeInteger(event.measureIndex) && event.measureIndex >= 0 ? event.measureIndex : null
  const onsetDivisions = Number.isSafeInteger(event.onsetDivisions) && event.onsetDivisions >= 0 ? event.onsetDivisions : null
  const sourceOrder = Number.isSafeInteger(event.sourceOrder) && event.sourceOrder >= 0 ? event.sourceOrder : null
  if (!sourceEventId || measureIndex === null || onsetDivisions === null || sourceOrder === null) return null
  return Object.freeze({ sourceEventId, measureIndex, onsetDivisions, sourceOrder })
}

function groupRecord(group, eventsById, index) {
  if (!group || typeof group !== 'object' || !Array.isArray(group.sourceEventIds)) return null
  const events = group.sourceEventIds.map((id) => eventsById.get(id)).filter(Boolean)
  if (!events.length || events.length !== group.sourceEventIds.length) return null
  const first = events.reduce((best, event) => event.sourceOrder < best.sourceOrder ? event : best, events[0])
  if (events.some((event) => event.measureIndex !== first.measureIndex || event.onsetDivisions !== first.onsetDivisions)) return null
  return {
    groupId: typeof group.groupId === 'string' && group.groupId ? group.groupId : `group-${index}`,
    sourceEventIds: Object.freeze(events.map((event) => event.sourceEventId)),
    measureIndex: first.measureIndex,
    onsetDivisions: first.onsetDivisions,
    sourceOrder: first.sourceOrder,
  }
}

function assignmentMap(sourceIds, assignments) {
  const byEvent = new Map()
  let invalid = 0
  for (const assignment of Array.isArray(assignments) ? assignments : []) {
    const sourceEventId = typeof assignment?.sourceEventId === 'string' ? assignment.sourceEventId : ''
    if (!sourceIds.has(sourceEventId) || !validString(assignment?.string) || !validFret(assignment?.fret) || byEvent.has(sourceEventId)) {
      invalid += 1
      continue
    }
    byEvent.set(sourceEventId, Object.freeze({ sourceEventId, string: assignment.string, fret: assignment.fret }))
  }
  return { byEvent, invalid }
}

function projectGroup(group, byEvent) {
  const usedStrings = new Set()
  let invalid = 0
  const placements = []
  for (const sourceEventId of group.sourceEventIds) {
    const assignment = byEvent.get(sourceEventId)
    if (!assignment) continue
    if (usedStrings.has(assignment.string)) {
      invalid += 1
      continue
    }
    usedStrings.add(assignment.string)
    placements.push(assignment)
  }
  placements.sort((a, b) => a.string - b.string || a.sourceEventId.localeCompare(b.sourceEventId))
  return {
    projected: Object.freeze({
      groupId: group.groupId,
      onsetDivisions: group.onsetDivisions,
      sourceEventIds: group.sourceEventIds,
      placements: Object.freeze(placements),
    }),
    invalid,
  }
}

export function buildGuitarTabAssignmentProjection({ sourceSession, assignments } = {}) {
  if (!sourceSession || !Array.isArray(sourceSession.events) || !Array.isArray(sourceSession.groups)) return frozenEmptyProjection()

  const eventsById = new Map()
  for (const event of sourceSession.events) {
    const record = eventRecord(event)
    if (!record || eventsById.has(record.sourceEventId)) return frozenEmptyProjection()
    eventsById.set(record.sourceEventId, record)
  }
  if (!eventsById.size) return frozenEmptyProjection()

  const groups = sourceSession.groups.map((group, index) => groupRecord(group, eventsById, index))
  if (groups.some((group) => !group)) return frozenEmptyProjection()
  groups.sort((a, b) => a.measureIndex - b.measureIndex || a.onsetDivisions - b.onsetDivisions || a.sourceOrder - b.sourceOrder)

  const { byEvent, invalid: assignmentInvalid } = assignmentMap(new Set(eventsById.keys()), assignments)
  let invalid = assignmentInvalid
  const measureMap = new Map()
  for (const group of groups) {
    const { projected, invalid: groupInvalid } = projectGroup(group, byEvent)
    invalid += groupInvalid
    const list = measureMap.get(group.measureIndex) ?? []
    list.push(projected)
    measureMap.set(group.measureIndex, list)
  }

  const measures = Array.from(measureMap, ([measureIndex, projectedGroups]) => Object.freeze({
    measureIndex,
    groups: Object.freeze(projectedGroups),
  }))
  const assigned = byEvent.size
  return Object.freeze({
    total: eventsById.size,
    assigned,
    remaining: Math.max(eventsById.size - assigned, 0),
    invalid,
    measures: Object.freeze(measures),
  })
}

export function formatGuitarTabAssignmentProgress(projection, exportReady = false) {
  const total = Number.isSafeInteger(projection?.total) ? projection.total : 0
  const assigned = Number.isSafeInteger(projection?.assigned) ? projection.assigned : 0
  const remaining = Number.isSafeInteger(projection?.remaining) ? projection.remaining : Math.max(total - assigned, 0)
  const invalid = Number.isSafeInteger(projection?.invalid) ? projection.invalid : 0
  if (!total) return 'TAB hedefinde atanabilir nota yok.'
  if (invalid) return `${assigned}/${total} nota geçerli atandı · ${invalid} hatalı kayıt · dışa aktarım kapalı.`
  if (remaining) return `${assigned}/${total} nota atandı — dışa aktarım için ${remaining} nota kaldı.`
  if (!exportReady) return `${assigned}/${total} nota atandı — atamalar tamam; editör doğrulaması dışa aktarımı henüz onaylamadı.`
  return `${assigned}/${total} nota atandı — TAB MusicXML dışa aktarıma hazır.`
}
