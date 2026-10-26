function failIdentity(code) {
  const error = new Error(`guitar-tab-identity-${String(code).toLowerCase().replaceAll('_', '-')}`)
  error.category = 'IDENTITY'
  error.code = code
  throw error
}

function localName(node) {
  return String(node?.localName ?? node?.tagName ?? node?.tag ?? '')
    .replace(/^.*:/u, '')
}

function elementChildren(node) {
  return [...(node?.children ?? [])]
}

function directChildren(node, name) {
  return elementChildren(node).filter((child) => localName(child) === name)
}

function descendants(node, name) {
  const result = []
  const visit = (parent) => {
    for (const child of elementChildren(parent)) {
      if (localName(child) === name) result.push(child)
      visit(child)
    }
  }
  visit(node)
  return result
}

function textOf(node) {
  return typeof node?.textContent === 'string' ? node.textContent.trim() : ''
}

function requiredTrimmedText(value, code) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    failIdentity(code)
  }
  return value
}

function canonicalPositiveIntegerNode(node, code) {
  const value = textOf(node)
  if (!/^[1-9][0-9]*$/u.test(value)) failIdentity(code)
  const number = Number(value)
  if (!Number.isSafeInteger(number)) failIdentity(code)
  return number
}

function canonicalNonNegativeIntegerNode(node, code) {
  const value = textOf(node)
  if (!/^(0|[1-9][0-9]*)$/u.test(value)) failIdentity(code)
  const number = Number(value)
  if (!Number.isSafeInteger(number)) failIdentity(code)
  return number
}

function freezeTarget(target) {
  return Object.freeze({
    partId: target.partId,
    partIndex: target.partIndex,
    staff: target.staff,
    voice: target.voice,
  })
}

export function normalizeGuitarTabTargetSelection(value, { allowNull = false } = {}) {
  if (value === null || value === undefined) {
    if (allowNull) return null
    failIdentity('TARGET_SELECTION_INVALID')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    failIdentity('TARGET_SELECTION_INVALID')
  }

  const keys = Object.keys(value)
  const required = ['partId', 'partIndex', 'staff', 'voice']
  if (keys.length !== required.length || required.some((key) => !Object.hasOwn(value, key))) {
    failIdentity('TARGET_SELECTION_INVALID')
  }

  const partId = typeof value.partId === 'string' ? value.partId : ''
  if (!partId || partId !== partId.trim()) failIdentity('TARGET_SELECTION_INVALID')
  if (!Number.isSafeInteger(value.partIndex) || value.partIndex < 0) failIdentity('TARGET_SELECTION_INVALID')
  if (!Number.isSafeInteger(value.staff) || value.staff < 1) failIdentity('TARGET_SELECTION_INVALID')
  if (!Number.isSafeInteger(value.voice) || value.voice < 0) failIdentity('TARGET_SELECTION_INVALID')

  return freezeTarget(value)
}

function exactPartEvidence(root) {
  if (localName(root) !== 'score-partwise') failIdentity('SCORE_PARTWISE_REQUIRED')
  const partLists = directChildren(root, 'part-list')
  if (partLists.length !== 1) failIdentity('PART_IDENTITY_MISMATCH')

  const listedNodes = directChildren(partLists[0], 'score-part')
  const bodyNodes = directChildren(root, 'part')
  if (listedNodes.length === 0 || listedNodes.length !== bodyNodes.length) {
    failIdentity('PART_IDENTITY_MISMATCH')
  }

  const listedIds = listedNodes.map((node, index) =>
    requiredTrimmedText(node.getAttribute?.('id'), `PART_ID_INVALID_${index}`))
  const bodyIds = bodyNodes.map((node, index) =>
    requiredTrimmedText(node.getAttribute?.('id'), `PART_ID_INVALID_${index}`))

  if (new Set(listedIds).size !== listedIds.length || new Set(bodyIds).size !== bodyIds.length) {
    failIdentity('PART_IDENTITY_DUPLICATE')
  }
  for (let index = 0; index < listedIds.length; index += 1) {
    if (listedIds[index] !== bodyIds[index]) failIdentity('PART_IDENTITY_MISMATCH')
  }

  return listedNodes.map((listedNode, partIndex) => Object.freeze({
    partId: listedIds[partIndex],
    partIndex,
    name: textOf(directChildren(listedNode, 'part-name')[0]) || listedIds[partIndex],
    bodyNode: bodyNodes[partIndex],
  }))
}

function declaredStaffCount(partNode) {
  const counts = new Set()
  for (const measure of directChildren(partNode, 'measure')) {
    for (const attributes of directChildren(measure, 'attributes')) {
      const stavesNodes = directChildren(attributes, 'staves')
      if (stavesNodes.length > 1) failIdentity('STAFF_IDENTITY_AMBIGUOUS')
      if (stavesNodes.length === 1) {
        counts.add(canonicalPositiveIntegerNode(stavesNodes[0], 'STAFF_IDENTITY_INVALID'))
      }
    }
  }
  if (counts.size > 1) failIdentity('STAFF_IDENTITY_AMBIGUOUS')
  return counts.size === 1 ? [...counts][0] : null
}

function rawPitchedNotes(partNode) {
  const records = []
  let noteIndex = 0
  const measures = directChildren(partNode, 'measure')
  measures.forEach((measure, measureIndex) => {
    for (const note of directChildren(measure, 'note')) {
      const pitchNodes = directChildren(note, 'pitch')
      if (pitchNodes.length > 1) failIdentity('NOTE_IDENTITY_AMBIGUOUS')
      if (pitchNodes.length !== 1) {
        noteIndex += 1
        continue
      }

      const staffNodes = directChildren(note, 'staff')
      const voiceNodes = directChildren(note, 'voice')
      if (staffNodes.length > 1 || voiceNodes.length > 1) {
        failIdentity('NOTE_IDENTITY_AMBIGUOUS')
      }

      records.push({
        node: note,
        measureIndex,
        noteIndex,
        explicitStaff: staffNodes.length === 1
          ? canonicalPositiveIntegerNode(staffNodes[0], 'STAFF_IDENTITY_INVALID')
          : null,
        explicitVoice: voiceNodes.length === 1
          ? canonicalNonNegativeIntegerNode(voiceNodes[0], 'VOICE_IDENTITY_INVALID')
          : null,
      })
      noteIndex += 1
    }
  })
  return records
}

function resolveStaffIdentities(records, staffCount) {
  const explicitStaves = new Set(records
    .map((record) => record.explicitStaff)
    .filter((value) => value !== null))

  if (staffCount !== null && [...explicitStaves].some((staff) => staff > staffCount)) {
    failIdentity('STAFF_IDENTITY_INVALID')
  }

  const hasMissingStaff = records.some((record) => record.explicitStaff === null)
  if (hasMissingStaff) {
    const effectiveSingleStaff = (staffCount === null || staffCount === 1)
      && [...explicitStaves].every((staff) => staff === 1)
    if (!effectiveSingleStaff) failIdentity('STAFF_IDENTITY_AMBIGUOUS')
  }

  return records.map((record) => ({
    ...record,
    staff: record.explicitStaff ?? 1,
    implicitStaff: record.explicitStaff === null,
  }))
}

function resolveVoiceIdentities(records) {
  const explicitByStaff = new Map()
  for (const record of records) {
    if (record.explicitVoice === null) continue
    const voices = explicitByStaff.get(record.staff) ?? new Set()
    voices.add(record.explicitVoice)
    explicitByStaff.set(record.staff, voices)
  }

  for (const record of records) {
    if (record.explicitVoice !== null) continue
    const voices = explicitByStaff.get(record.staff) ?? new Set()
    if ([...voices].some((voice) => voice !== 1)) {
      failIdentity('VOICE_IDENTITY_AMBIGUOUS')
    }
  }

  return records.map((record) => Object.freeze({
    node: record.node,
    measureIndex: record.measureIndex,
    noteIndex: record.noteIndex,
    staff: record.staff,
    voice: record.explicitVoice ?? 1,
    implicitStaff: record.implicitStaff,
    implicitVoice: record.explicitVoice === null,
  }))
}

function buildStaffInventory(pitchedNotes) {
  const staffMap = new Map()
  for (const note of pitchedNotes) {
    let staffRecord = staffMap.get(note.staff)
    if (!staffRecord) {
      staffRecord = new Map()
      staffMap.set(note.staff, staffRecord)
    }
    staffRecord.set(note.voice, (staffRecord.get(note.voice) ?? 0) + 1)
  }

  return Object.freeze([...staffMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([staff, voiceMap]) => Object.freeze({
      staff,
      voices: Object.freeze([...voiceMap.entries()]
        .sort(([a], [b]) => a - b)
        .map(([voice, pitchedEventCount]) => Object.freeze({ voice, pitchedEventCount }))),
    })))
}

export function analyzeGuitarTabCanonicalIdentity(root, { label = 'score' } = {}) {
  void label
  const partEvidence = exactPartEvidence(root)
  const parts = partEvidence.map((evidence) => {
    const staffCount = declaredStaffCount(evidence.bodyNode)
    const rawNotes = rawPitchedNotes(evidence.bodyNode)
    const staffResolved = resolveStaffIdentities(rawNotes, staffCount)
    const pitchedNotes = Object.freeze(resolveVoiceIdentities(staffResolved))
    return Object.freeze({
      partId: evidence.partId,
      partIndex: evidence.partIndex,
      name: evidence.name,
      staves: buildStaffInventory(pitchedNotes),
      pitchedNotes,
    })
  })
  return Object.freeze({ parts: Object.freeze(parts) })
}

export function resolveGuitarTabCanonicalTarget(identityAnalysis, targetSelection) {
  const target = normalizeGuitarTabTargetSelection(targetSelection)
  if (!identityAnalysis || !Array.isArray(identityAnalysis.parts)) {
    failIdentity('ANALYSIS_INVALID')
  }

  const part = identityAnalysis.parts[target.partIndex]
  if (!part || part.partId !== target.partId) failIdentity('TARGET_PART_MISMATCH')
  if (!Array.isArray(part.pitchedNotes) || part.pitchedNotes.length === 0) failIdentity('TARGET_EMPTY')

  const staff = part.staves.find((candidate) => candidate.staff === target.staff)
  if (!staff) failIdentity('TARGET_STAFF_MISMATCH')
  const voice = staff.voices.find((candidate) => candidate.voice === target.voice)
  if (!voice) failIdentity('TARGET_VOICE_MISMATCH')

  const pitchedNotes = Object.freeze(part.pitchedNotes.filter((note) =>
    note.staff === target.staff && note.voice === target.voice))
  if (pitchedNotes.length === 0) failIdentity('TARGET_EMPTY')

  return Object.freeze({
    targetSelection: target,
    part,
    staff,
    voice,
    pitchedEventCount: pitchedNotes.length,
    pitchedNotes,
  })
}
