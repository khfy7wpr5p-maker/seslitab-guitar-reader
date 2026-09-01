// STI-08/09 — bounded SMuFL keypad + Editor Core basic edit boundary.
//
// The Editor Core actionId is the only edit authority. Glyph/codepoint data is
// presentation-only. This service admits only a current PR-B exact score hit,
// reconstructs Editor timing in the whole-note Rational unit required by the
// frozen Editor Core contract, selects the exact current manifest token, and
// commits one basic keypad action exactly once.
//
// Product revision projection / revalidation / rerender is intentionally NOT
// performed here. STI-11 owns that serialized pipeline. After one local Editor
// commit this context becomes `productSyncPending` and refuses a second commit,
// preventing hidden Editor-vs-Package8 divergence or legacy dual writes.

import { createEditorCoreRevisionBinding, assertEditorCoreSessionInitialization } from './editorCoreIntegrationAuthority.js'
import {
  EDITOR_EXTERNAL_HIT_CONTRACT_VERSION,
  EDITOR_RENDER_MANIFEST_VERSION,
  EDITOR_RENDER_REQUEST_VERSION,
  ST_RENDERING_LAYER_EDITOR_PROFILE,
  extractEditorPartNameEvidence,
  projectTeacherRevisionToEditorScore,
  resolveEditorCoreRuntime,
} from './editorRendererSelectionBridge.js'
import { stageS06SelectionMatchesRevision } from './stageS06SelectionIdentity.js'

export const SESLITAB_EDITOR_KEYPAD_INTEGRATION_VERSION = '1.0.0'
export const EDITOR_KEYPAD_CONTRACT_VERSION = '1.0.0'
export const EDITOR_KEYPAD_MODE = 'EXISTING_SCORE_CORRECTION'
export const EDITOR_KEYPAD_SEMANTIC_AUTHORITY = 'ACTION_ID_ONLY'

export const BASIC_EDITOR_KEYPAD_ACTION_IDS = Object.freeze([
  'duration.whole',
  'duration.half',
  'duration.quarter',
  'duration.eighth',
  'duration.16th',
  'duration.32nd',
  'rest.whole',
  'rest.half',
  'rest.quarter',
  'rest.eighth',
  'rest.16th',
  'rest.32nd',
  'accidental.flat',
  'accidental.natural',
  'accidental.sharp',
  'dot.set.0',
  'dot.set.1',
  'dot.set.2',
  'dot.set.3',
])

export const ADVANCED_EDITOR_KEYPAD_ACTION_IDS = Object.freeze([
  'tuplet.triplet',
  'tie.edit',
  'slur.edit',
])

const BASIC_ACTION_SET = new Set(BASIC_EDITOR_KEYPAD_ACTION_IDS)
const ALL_ACTION_SET = new Set([...BASIC_EDITOR_KEYPAD_ACTION_IDS, ...ADVANCED_EDITOR_KEYPAD_ACTION_IDS])
const PR_B_EXACT_INTERACTION = 'score-editor-current-hit'

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function gcd(left, right) {
  let a = Math.abs(left)
  let b = Math.abs(right)
  while (b !== 0) {
    const next = a % b
    a = b
    b = next
  }
  return a
}

function reducedRational(numerator, denominator, label) {
  if (!Number.isSafeInteger(numerator) || numerator < 0 || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error(`STI-09 cannot convert ${label} to a safe Editor Rational.`)
  }
  const divisor = gcd(numerator, denominator)
  return Object.freeze({ numerator: numerator / divisor, denominator: denominator / divisor })
}

export function sesliTabBeatRationalToEditorWholeNoteRational(value, label = 'timing') {
  if (!isPlainObject(value) || !Number.isSafeInteger(value.numerator) || !Number.isSafeInteger(value.denominator)) {
    throw new Error(`STI-09 requires an exact SesliTab beat Rational for ${label}.`)
  }
  const denominator = value.denominator * 4
  if (!Number.isSafeInteger(denominator)) throw new Error(`STI-09 ${label} denominator exceeds safe range.`)
  return reducedRational(value.numerator, denominator, label)
}

function transformEventTiming(event, label) {
  if (!isPlainObject(event)) throw new Error(`STI-09 requires plain Editor event data for ${label}.`)
  return Object.freeze({
    ...event,
    onset: sesliTabBeatRationalToEditorWholeNoteRational(event.onset, `${label} onset`),
    duration: sesliTabBeatRationalToEditorWholeNoteRational(event.duration, `${label} duration`),
  })
}

export function normalizeProjectedEditorTiming(scoreInput) {
  if (!isPlainObject(scoreInput) || !Array.isArray(scoreInput.parts)) {
    throw new Error('STI-09 requires an exact projected Editor ScoreDocument input.')
  }
  return Object.freeze({
    ...scoreInput,
    parts: Object.freeze(scoreInput.parts.map((part, partIndex) => Object.freeze({
      ...part,
      staves: Object.freeze(part.staves.map((staff, staffIndex) => Object.freeze({
        ...staff,
        measures: Object.freeze(staff.measures.map((measure, measureIndex) => Object.freeze({
          ...measure,
          voices: Object.freeze(measure.voices.map((voice, voiceIndex) => Object.freeze({
            ...voice,
            events: Object.freeze(voice.events.map((event, eventIndex) => transformEventTiming(
              event,
              `part ${partIndex} staff ${staffIndex} measure ${measureIndex} voice ${voiceIndex} event ${eventIndex}`,
            ))),
          }))),
        }))),
      }))),
    }))),
  })
}

function flattenManifestActions(manifest) {
  const actions = []
  for (const group of manifest.groups) {
    if (!isPlainObject(group) || typeof group.id !== 'string' || !Array.isArray(group.actions)) {
      throw new Error('Editor keypad manifest contains an invalid group.')
    }
    for (const action of group.actions) actions.push(action)
  }
  return actions
}

export function verifyEditorKeypadManifest(manifest) {
  if (!isPlainObject(manifest)) throw new Error('Editor keypad manifest is unavailable.')
  if (manifest.version !== EDITOR_KEYPAD_CONTRACT_VERSION || manifest.mode !== EDITOR_KEYPAD_MODE) {
    throw new Error('Editor keypad manifest version/mode mismatch.')
  }
  if (manifest.semanticAuthority !== EDITOR_KEYPAD_SEMANTIC_AUTHORITY) {
    throw new Error('Editor keypad semantic authority mismatch.')
  }
  if (manifest.rawGlyphCodepointsIncluded !== false || manifest.fontAssetsIncluded !== false) {
    throw new Error('Editor keypad manifest must not supply raw glyph codepoints or font assets.')
  }
  if (!Array.isArray(manifest.groups)) throw new Error('Editor keypad manifest groups are unavailable.')

  const seen = new Set()
  for (const descriptor of flattenManifestActions(manifest)) {
    if (!isPlainObject(descriptor) || typeof descriptor.actionId !== 'string' || !ALL_ACTION_SET.has(descriptor.actionId)) {
      throw new Error('Editor keypad manifest contains an unknown action.')
    }
    if (seen.has(descriptor.actionId)) throw new Error(`Editor keypad manifest duplicates ${descriptor.actionId}.`)
    if (typeof descriptor.accessibleLabelKey !== 'string' || !descriptor.accessibleLabelKey.startsWith('keypad.')) {
      throw new Error(`Editor keypad action ${descriptor.actionId} has no accessible label key.`)
    }
    if (descriptor.glyph !== null) {
      if (!isPlainObject(descriptor.glyph) || !/^[A-Za-z][A-Za-z0-9]*$/.test(descriptor.glyph.smuflGlyphName)) {
        throw new Error(`Editor keypad action ${descriptor.actionId} has invalid SMuFL glyph-name metadata.`)
      }
      if (![1, 2, 3].includes(descriptor.glyph.repeat)) {
        throw new Error(`Editor keypad action ${descriptor.actionId} has invalid glyph repeat metadata.`)
      }
    }
    seen.add(descriptor.actionId)
  }
  if (seen.size !== ALL_ACTION_SET.size || [...ALL_ACTION_SET].some((actionId) => !seen.has(actionId))) {
    throw new Error('Editor keypad manifest does not exactly cover the frozen SesliTab action set.')
  }
  return manifest
}

export function readEditorKeypadManifest(editorRuntime = resolveEditorCoreRuntime()) {
  if (!editorRuntime || typeof editorRuntime.getEditorKeypadManifest !== 'function') {
    throw new Error('Editor Core keypad manifest runtime method is unavailable.')
  }
  return verifyEditorKeypadManifest(editorRuntime.getEditorKeypadManifest())
}

export function isBasicEditorKeypadAction(actionId) {
  return typeof actionId === 'string' && BASIC_ACTION_SET.has(actionId)
}

function assertExactPrBSelection(package3Snapshot, teacherRevision) {
  if (!stageS06SelectionMatchesRevision(package3Snapshot, teacherRevision)) {
    throw new Error('STI-09 requires a current revision-bound exact note selection.')
  }
  const identity = package3Snapshot?.selectedNoteIdentity
  if (identity?.interaction !== PR_B_EXACT_INTERACTION) {
    throw new Error('STI-09 requires selection proven by the PR-B renderer→Editor hit path.')
  }
  if (!Number.isSafeInteger(package3Snapshot.selectedNoteIndex) || package3Snapshot.selectedNoteIndex < 0) {
    throw new Error('STI-09 exact selected note index is unavailable.')
  }
  return package3Snapshot.selectedNoteIndex
}

function sameRendererProfile(observed) {
  return isPlainObject(observed) && Object.keys(ST_RENDERING_LAYER_EDITOR_PROFILE).every(
    (key) => observed[key] === ST_RENDERING_LAYER_EDITOR_PROFILE[key],
  )
}

function exactNoteManifestEntry(session, noteId) {
  const entries = session?.renderRequest?.manifest?.entries
  if (!Array.isArray(entries)) throw new Error('Editor current render manifest is unavailable.')
  const matches = entries.filter((entry) => entry?.address?.kind === 'note' && entry.address.noteId === noteId)
  if (matches.length !== 1) throw new Error(`STI-09 exact Editor token resolution expected one note entry, observed ${matches.length}.`)
  return matches[0]
}

function selectExactEditorNote(runtime, session, noteId) {
  const entry = exactNoteManifestEntry(session, noteId)
  const request = session.renderRequest
  const externalHit = Object.freeze({
    contractVersion: EDITOR_EXTERNAL_HIT_CONTRACT_VERSION,
    documentId: request.documentId,
    revisionId: request.revisionId,
    rendererFamily: request.renderer.family,
    renderRequestVersion: request.contractVersion,
    renderManifestVersion: request.manifest.contractVersion,
    opaqueHitToken: entry.token,
  })
  const selectedSession = runtime.selectRendererHit(session, externalHit)
  const selected = selectedSession?.selection?.primary
  if (selected?.kind !== 'note' || selected.noteId !== noteId || selected.revisionId !== request.revisionId) {
    throw new Error('STI-09 Editor Core rejected the exact current note selection.')
  }
  return selectedSession
}

function freezeContext(context, session, productSyncPending = context.productSyncPending ?? false) {
  return Object.freeze({
    contractVersion: SESLITAB_EDITOR_KEYPAD_INTEGRATION_VERSION,
    binding: context.binding,
    manifest: context.manifest,
    noteIds: context.noteIds,
    selectedNoteIndex: context.selectedNoteIndex,
    editorRuntime: context.editorRuntime,
    session,
    productSyncPending,
  })
}

export async function createBasicEditorKeypadContext({
  package3Snapshot,
  teacherRevision,
  musicXml,
  editorRuntime,
  cryptoScope = globalThis.crypto,
  DOMParserCtor = globalThis.DOMParser,
} = {}) {
  const runtime = editorRuntime ?? resolveEditorCoreRuntime()
  for (const method of ['createScoreDocument', 'emptyNotationDocument', 'createEditorSessionWithRendererProfile', 'selectRendererHit', 'getEditorKeypadManifest', 'commitKeypadAction']) {
    if (!runtime || typeof runtime[method] !== 'function') throw new Error(`Editor Core keypad runtime method is unavailable: ${method}.`)
  }
  const selectedNoteIndex = assertExactPrBSelection(package3Snapshot, teacherRevision)
  const manifest = readEditorKeypadManifest(runtime)
  const partNameEvidence = extractEditorPartNameEvidence(musicXml, { DOMParserCtor })
  const projection = await projectTeacherRevisionToEditorScore(teacherRevision, { cryptoScope, partNameEvidence })
  const correctedScoreInput = normalizeProjectedEditorTiming(projection.scoreInput)
  const score = runtime.createScoreDocument(correctedScoreInput)
  const notation = runtime.emptyNotationDocument(score)
  let session = runtime.createEditorSessionWithRendererProfile(score, notation, ST_RENDERING_LAYER_EDITOR_PROFILE)
  if (!session?.renderRequest || !sameRendererProfile(session.renderRequest.renderer)) {
    throw new Error('STI-09 Editor session did not preserve the exact Rendering Layer profile.')
  }
  if (session.renderRequest.contractVersion !== EDITOR_RENDER_REQUEST_VERSION || session.renderRequest.manifest?.contractVersion !== EDITOR_RENDER_MANIFEST_VERSION) {
    throw new Error('STI-09 Editor render contract mismatch.')
  }

  const binding = createEditorCoreRevisionBinding({
    package3Snapshot,
    teacherRevision,
    editorDocumentId: score.id,
  })
  assertEditorCoreSessionInitialization(binding, session)

  const noteId = projection.noteIds[selectedNoteIndex]
  if (typeof noteId !== 'string' || noteId.length === 0) {
    throw new Error('STI-09 selected target has no surviving Editor note identity.')
  }
  session = selectExactEditorNote(runtime, session, noteId)

  return freezeContext({
    binding,
    manifest,
    noteIds: projection.noteIds,
    selectedNoteIndex,
    editorRuntime: runtime,
    productSyncPending: false,
  }, session, false)
}

function defaultIdentityFactory(cryptoScope = globalThis.crypto) {
  if (!cryptoScope || typeof cryptoScope.randomUUID !== 'function') {
    throw new Error('STI-09 requires cryptographically generated commit identity.')
  }
  const transactionId = `st-kp-${cryptoScope.randomUUID()}`
  const nextRevisionId = `st-kp-rev-${cryptoScope.randomUUID()}`
  return Object.freeze({ version: '1.0.0', transactionId, nextRevisionId })
}

function validateCommitIdentity(identity) {
  if (!isPlainObject(identity) || Object.keys(identity).sort().join(',') !== 'nextRevisionId,transactionId,version') {
    throw new Error('STI-09 commit identity field set is invalid.')
  }
  if (identity.version !== '1.0.0') throw new Error('STI-09 commit identity version mismatch.')
  for (const field of ['transactionId', 'nextRevisionId']) {
    if (typeof identity[field] !== 'string' || !identity[field].trim() || identity[field] !== identity[field].trim()) {
      throw new Error(`STI-09 commit identity ${field} is invalid.`)
    }
  }
  return identity
}

export function commitBasicEditorKeypadAction(context, actionId, {
  identity = null,
  cryptoScope = globalThis.crypto,
} = {}) {
  if (!context || context.contractVersion !== SESLITAB_EDITOR_KEYPAD_INTEGRATION_VERSION) {
    return Object.freeze({ kind: 'FAIL', code: 'ST_KEYPAD_CONTEXT_INVALID' })
  }
  if (context.productSyncPending) {
    return Object.freeze({ kind: 'FAIL', code: 'ST_KEYPAD_PRODUCT_SYNC_PENDING' })
  }
  if (!isBasicEditorKeypadAction(actionId)) {
    return Object.freeze({ kind: 'FAIL', code: 'ST_KEYPAD_ACTION_NOT_BASIC' })
  }
  const runtime = context.editorRuntime
  if (!runtime || typeof runtime.commitKeypadAction !== 'function') {
    return Object.freeze({ kind: 'FAIL', code: 'ST_KEYPAD_RUNTIME_UNAVAILABLE' })
  }
  const selected = context.session?.selection?.primary
  if (selected?.kind !== 'note' || selected.revisionId !== context.binding.editorRevisionId) {
    return Object.freeze({ kind: 'FAIL', code: 'ST_KEYPAD_SELECTION_STALE' })
  }

  let commitIdentity
  try {
    commitIdentity = validateCommitIdentity(identity ?? defaultIdentityFactory(cryptoScope))
  } catch (error) {
    return Object.freeze({ kind: 'FAIL', code: 'ST_KEYPAD_IDENTITY_INVALID', message: String(error?.message ?? error) })
  }

  // Exactly one invocation. There is deliberately no legacy S07/Stage E field
  // write before or after this call.
  const result = runtime.commitKeypadAction(
    context.session,
    Object.freeze({ version: EDITOR_KEYPAD_CONTRACT_VERSION, actionId }),
    commitIdentity,
  )
  if (!result?.ok || !result.session) {
    return Object.freeze({
      kind: 'FAIL',
      code: typeof result?.error?.code === 'string' ? result.error.code : 'ST_KEYPAD_COMMIT_REJECTED',
      message: typeof result?.error?.message === 'string' ? result.error.message : 'Editor keypad commit rejected.',
    })
  }
  const nextRevisionId = result.session?.history?.present?.score?.revision?.id
  if (nextRevisionId !== commitIdentity.nextRevisionId) {
    return Object.freeze({ kind: 'FAIL', code: 'ST_KEYPAD_REVISION_MISMATCH' })
  }

  return Object.freeze({
    kind: 'COMMITTED',
    actionId,
    transactionId: commitIdentity.transactionId,
    nextRevisionId: commitIdentity.nextRevisionId,
    context: freezeContext(context, result.session, true),
    productSyncRequired: true,
  })
}
