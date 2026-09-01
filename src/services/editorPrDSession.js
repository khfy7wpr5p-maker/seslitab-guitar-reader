// STI-10 — current product revision -> fully rehydrated Editor Core session.

import {
  extractEditorPartNameEvidence,
  projectTeacherRevisionToEditorScore,
  ST_RENDERING_LAYER_EDITOR_PROFILE,
} from './editorRendererSelectionBridge.js'
import {
  ADVANCED_EDITOR_KEYPAD_ACTION_IDS,
  BASIC_EDITOR_KEYPAD_ACTION_IDS,
  normalizeProjectedEditorTiming,
  readEditorKeypadManifest,
} from './editorKeypadIntegration.js'
import {
  buildPrDAdvancedTarget,
  buildPrDProjectionMapping,
  createPrDValidatedNotationDocument,
} from './editorPrDNotationBridge.js'
import { changedPrDProductIndexes } from './editorPrDProductPipeline.js'
import {
  isStageS06SelectionCurrent,
  stageS06SelectionMatchesRevision,
} from './stageS06SelectionIdentity.js'

export const SESLITAB_EDITOR_PRD_SESSION_VERSION = '1.0.0'
const ALL_ACTIONS = new Set([...BASIC_EDITOR_KEYPAD_ACTION_IDS, ...ADVANCED_EDITOR_KEYPAD_ACTION_IDS])

function exactSelectedIndex(package3Snapshot, teacherRevision, { allowVerifiedRebind = true } = {}) {
  if (!Number.isSafeInteger(package3Snapshot?.selectedNoteIndex) || !package3Snapshot?.selectedNoteIdentity) {
    throw new Error('STI-10 requires one exact current SesliTab note selection.')
  }
  if (!isStageS06SelectionCurrent(package3Snapshot, { requireRevision: true }) || !stageS06SelectionMatchesRevision(package3Snapshot, teacherRevision)) {
    throw new Error('STI-10 selection is stale for the current immutable product revision.')
  }
  const interaction = package3Snapshot.selectedNoteIdentity.interaction
  if (interaction !== 'score-editor-current-hit' && !(allowVerifiedRebind && interaction === 'editor-keypad-rebind')) {
    throw new Error('STI-10 keypad requires an exact current Editor hit or its verified post-commit rebind.')
  }
  return package3Snapshot.selectedNoteIndex
}

function runtimeSurface(runtime) {
  for (const method of [
    'createScoreDocument',
    'createNotationDocument',
    'createEditorSessionWithRendererProfile',
    'selectSessionRenderToken',
    'getEditorKeypadManifest',
    'commitKeypadAction',
  ]) {
    if (typeof runtime?.[method] !== 'function') throw new Error(`Editor Core runtime method ${method} is unavailable.`)
  }
  return runtime
}

function exactNoteToken(session, noteId) {
  const entries = session?.renderRequest?.manifest?.entries
  if (!Array.isArray(entries)) throw new Error('Editor render manifest is unavailable.')
  const matches = entries.filter((entry) => entry?.address?.kind === 'note' && entry.address.noteId === noteId)
  if (matches.length !== 1 || typeof matches[0]?.token !== 'string') {
    throw new Error(`Expected exactly one current Editor note token for ${noteId}; observed ${matches.length}.`)
  }
  return matches[0].token
}

export async function createPrDEditorSessionContext({
  package3Snapshot,
  teacherRevision,
  musicXml,
  editorRuntime,
  cryptoScope = globalThis.crypto,
  DOMParserCtor = globalThis.DOMParser,
  allowVerifiedRebind = true,
} = {}) {
  const runtime = runtimeSurface(editorRuntime)
  const selectedNoteIndex = exactSelectedIndex(package3Snapshot, teacherRevision, { allowVerifiedRebind })
  if (teacherRevision.content[selectedNoteIndex]?.isRest === true) throw new Error('Renderer note selection cannot target a rest for keypad editing.')
  const partNameEvidence = extractEditorPartNameEvidence(musicXml, { DOMParserCtor })
  const projection = await projectTeacherRevisionToEditorScore(teacherRevision, { cryptoScope, partNameEvidence })
  const scoreInput = normalizeProjectedEditorTiming(projection.scoreInput)
  const score = runtime.createScoreDocument(scoreInput)
  const mapping = buildPrDProjectionMapping({ teacherRevision, score, noteIds: projection.noteIds })
  const notation = createPrDValidatedNotationDocument({ runtime, musicXml, teacherRevision, score, mapping, DOMParserCtor })
  let session = runtime.createEditorSessionWithRendererProfile(score, notation, ST_RENDERING_LAYER_EDITOR_PROFILE)
  const noteId = mapping.noteIds[selectedNoteIndex]
  if (typeof noteId !== 'string') throw new Error('Selected product note did not project to a current Editor note id.')
  session = runtime.selectSessionRenderToken(session, exactNoteToken(session, noteId))
  if (session?.selection?.primary?.kind !== 'note' || session.selection.primary.noteId !== noteId || session.selection.primary.revisionId !== teacherRevision.revisionId) {
    throw new Error('Editor Core did not preserve exact current selected note identity during rehydration.')
  }
  const manifest = readEditorKeypadManifest(runtime)
  return Object.freeze({
    version: SESLITAB_EDITOR_PRD_SESSION_VERSION,
    runtime,
    manifest,
    mapping,
    musicXml,
    teacherRevision,
    selectedNoteIndex,
    baseSession: session,
    session,
  })
}

export function commitPrDEditorAction(context, actionId, {
  identity,
  productIndexes = null,
} = {}) {
  if (!context || context.version !== SESLITAB_EDITOR_PRD_SESSION_VERSION) throw new Error('Current STI-10 Editor session context is required.')
  if (!ALL_ACTIONS.has(actionId)) throw new Error(`Unsupported Editor keypad action ${actionId}.`)
  if (!identity || identity.version !== '1.0.0' || typeof identity.transactionId !== 'string' || typeof identity.nextRevisionId !== 'string') {
    throw new Error('Exact Editor keypad commit identity is required.')
  }
  const advanced = ADVANCED_EDITOR_KEYPAD_ACTION_IDS.includes(actionId)
  const target = advanced
    ? buildPrDAdvancedTarget({ session: context.session, mapping: context.mapping, actionId, productIndexes })
    : null
  const result = context.runtime.commitKeypadAction(
    context.session,
    Object.freeze({ version: '1.0.0', actionId }),
    identity,
    target,
  )
  if (!result?.ok || !result.session) {
    const code = result?.error?.code ?? 'KEYPAD_COMMIT_FAILED'
    const message = result?.error?.message ?? 'Editor keypad action failed.'
    throw Object.assign(new Error(`${code}: ${message}`), { code })
  }
  if (result.session.history?.present?.score?.revision?.id !== identity.nextRevisionId) {
    throw new Error('Editor Core atomic keypad revision identity diverged from the requested product revision id.')
  }
  const changedIndexes = changedPrDProductIndexes({
    baseSession: context.session,
    nextSession: result.session,
    mapping: context.mapping,
  })
  if (changedIndexes.length === 0) throw new Error('Editor keypad commit produced no exact product-visible semantic change.')
  return Object.freeze({
    version: SESLITAB_EDITOR_PRD_SESSION_VERSION,
    actionId,
    identity,
    advancedTarget: target,
    baseSession: context.session,
    session: result.session,
    changedIndexes,
    selectedNoteIndex: context.selectedNoteIndex,
    mapping: context.mapping,
    musicXml: context.musicXml,
  })
}
