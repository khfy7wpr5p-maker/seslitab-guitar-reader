// STI-08/10 — responsive Sibelius-type SMuFL keypad shell.
//
// Semantics come only from Editor Core actionId descriptors. The SMuFL name is
// presentation metadata and is resolved through the separately pinned official
// SMuFL glyphnames.json prepared at build time. Raw codepoints are never stored
// in Editor Core or treated as edit targets. STI-10 may enable advanced action
// buttons only when the host explicit-target capture pipeline is ready.

import {
  ADVANCED_EDITOR_KEYPAD_ACTION_IDS,
  BASIC_EDITOR_KEYPAD_ACTION_IDS,
  isBasicEditorKeypadAction,
  readEditorKeypadManifest,
} from './services/editorKeypadIntegration.js'

export const STAGE_PR_C_KEYPAD_VERSION = '1.0.0'
export const STAGE_PR_C_SMUFL_GLYPH_METADATA_URL = '/smufl-keypad/glyphnames.json'
export const STAGE_PR_C_BRAVURA_FONT_FAMILY = 'Bravura'

const ADVANCED_ACTION_SET = new Set(ADVANCED_EDITOR_KEYPAD_ACTION_IDS)
const EXPECTED_ACTIONS = new Set([...BASIC_EDITOR_KEYPAD_ACTION_IDS, ...ADVANCED_EDITOR_KEYPAD_ACTION_IDS])
const KEYPAD_PAGES = Object.freeze([1, 2, 3])

const GROUP_PAGE = Object.freeze({
  duration: 1,
  rests: 1,
  accidentals: 2,
  dots: 2,
  tuplets: 3,
  connections: 3,
})

const LABELS_TR = Object.freeze({
  'keypad.group.duration': 'Nota süreleri',
  'keypad.group.rests': 'Suslar',
  'keypad.group.accidentals': 'Arızalar',
  'keypad.group.dots': 'Noktalar',
  'keypad.group.tuplets': 'Tuplet',
  'keypad.group.connections': 'Bağlar',
  'keypad.duration.whole': 'Birlik nota',
  'keypad.duration.half': 'İkilik nota',
  'keypad.duration.quarter': 'Dörtlük nota',
  'keypad.duration.eighth': 'Sekizlik nota',
  'keypad.duration.16th': 'On altılık nota',
  'keypad.duration.32nd': 'Otuz ikilik nota',
  'keypad.rest.whole': 'Birlik sus',
  'keypad.rest.half': 'İkilik sus',
  'keypad.rest.quarter': 'Dörtlük sus',
  'keypad.rest.eighth': 'Sekizlik sus',
  'keypad.rest.16th': 'On altılık sus',
  'keypad.rest.32nd': 'Otuz ikilik sus',
  'keypad.accidental.flat': 'Bemol',
  'keypad.accidental.natural': 'Bekar',
  'keypad.accidental.sharp': 'Diyez',
  'keypad.dot.set.0': 'Noktayı kaldır',
  'keypad.dot.set.1': 'Bir nokta',
  'keypad.dot.set.2': 'İki nokta',
  'keypad.dot.set.3': 'Üç nokta',
  'keypad.tuplet.triplet': 'Üçleme',
  'keypad.tie.edit': 'Uzatma bağı',
  'keypad.slur.edit': 'Deyim bağı',
})

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function labelFor(key) {
  return LABELS_TR[key] ?? key
}

export function smuflCodepointToCharacter(codepoint) {
  if (typeof codepoint !== 'string' || !/^U\+[0-9A-F]{4,6}$/.test(codepoint)) {
    throw new Error('Invalid official SMuFL codepoint metadata.')
  }
  const value = Number.parseInt(codepoint.slice(2), 16)
  if (!Number.isSafeInteger(value) || value < 0 || value > 0x10ffff) {
    throw new Error('SMuFL codepoint is outside Unicode range.')
  }
  return String.fromCodePoint(value)
}

export function resolveSmuflGlyphPresentation(descriptor, glyphNames) {
  if (!descriptor || descriptor.glyph === null) return null
  const glyphName = descriptor.glyph.smuflGlyphName
  const entry = glyphNames?.[glyphName]
  if (!isPlainObject(entry) || typeof entry.codepoint !== 'string') {
    throw new Error(`Pinned SMuFL metadata is missing Editor glyph ${glyphName}.`)
  }
  const character = smuflCodepointToCharacter(entry.codepoint)
  const repeat = descriptor.glyph.repeat
  if (![1, 2, 3].includes(repeat)) throw new Error(`Invalid glyph repeat for ${descriptor.actionId}.`)
  return Object.freeze({ glyphName, character, repeat })
}

export async function loadStagePrCSmuflPresentation({
  fetchImpl = globalThis.fetch,
  fontSet = globalThis.document?.fonts,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('SMuFL metadata fetch is unavailable.')
  const response = await fetchImpl(STAGE_PR_C_SMUFL_GLYPH_METADATA_URL, { cache: 'no-store' })
  if (!response?.ok) throw new Error(`SMuFL glyph metadata load failed (${response?.status ?? 'unknown'}).`)
  const glyphNames = await response.json()
  if (!isPlainObject(glyphNames)) throw new Error('SMuFL glyph metadata response is invalid.')

  if (!fontSet || typeof fontSet.load !== 'function' || typeof fontSet.check !== 'function') {
    throw new Error('Browser FontFaceSet is unavailable for Bravura admission.')
  }
  await fontSet.load(`32px ${STAGE_PR_C_BRAVURA_FONT_FAMILY}`)
  if (!fontSet.check(`32px ${STAGE_PR_C_BRAVURA_FONT_FAMILY}`)) {
    throw new Error('Pinned Bravura font did not become available.')
  }
  return Object.freeze({ glyphNames })
}

function hostPrimitive(descriptor) {
  if (descriptor.actionId === 'dot.set.0') {
    return Object.freeze({ kind: 'text', text: '0', className: 'stage-prc-keypad-zero-dot' })
  }
  if (descriptor.hostPrimitiveHint === 'tie') {
    return Object.freeze({ kind: 'primitive', text: '', className: 'stage-prc-keypad-tie' })
  }
  if (descriptor.hostPrimitiveHint === 'slur') {
    return Object.freeze({ kind: 'primitive', text: '', className: 'stage-prc-keypad-slur' })
  }
  return null
}

export function buildStagePrCKeypadModel(manifest, glyphNames, {
  exactSelectionReady = false,
  productSyncPending = false,
  advancedActionsReady = false,
} = {}) {
  const verifiedManifest = readEditorKeypadManifest({ getEditorKeypadManifest: () => manifest })
  const actions = []
  const seen = new Set()

  for (const group of verifiedManifest.groups) {
    const page = GROUP_PAGE[group.id]
    if (!page) throw new Error(`Unsupported keypad group layout: ${group.id}.`)
    for (const descriptor of group.actions) {
      if (seen.has(descriptor.actionId)) throw new Error(`Duplicate keypad model action ${descriptor.actionId}.`)
      seen.add(descriptor.actionId)
      const glyph = resolveSmuflGlyphPresentation(descriptor, glyphNames)
      const primitive = glyph ? null : hostPrimitive(descriptor)
      if (!glyph && !primitive) throw new Error(`No admitted presentation exists for ${descriptor.actionId}.`)
      const basic = isBasicEditorKeypadAction(descriptor.actionId)
      const advanced = ADVANCED_ACTION_SET.has(descriptor.actionId)
      const enabled = exactSelectionReady && !productSyncPending && (basic || (advanced && advancedActionsReady))
      const disabledReason = enabled
        ? null
        : productSyncPending
          ? 'Skor güncelleme senkronizasyonu bekleniyor.'
          : !exactSelectionReady
            ? 'Exact nota seçimi gerekiyor.'
            : advanced
              ? 'Explicit advanced hedef seçimi hazır değil.'
              : 'Bu tuş mevcut Editor sözleşmesinde kullanılamıyor.'
      actions.push(Object.freeze({
        page,
        groupId: group.id,
        groupLabel: labelFor(group.accessibleLabelKey),
        actionId: descriptor.actionId,
        accessibleLabel: labelFor(descriptor.accessibleLabelKey),
        glyph,
        primitive,
        advanced,
        enabled,
        disabledReason,
      }))
    }
  }
  if (seen.size !== EXPECTED_ACTIONS.size || [...EXPECTED_ACTIONS].some((actionId) => !seen.has(actionId))) {
    throw new Error('Keypad shell action set does not exactly match Editor Core manifest.')
  }
  return Object.freeze({ version: STAGE_PR_C_KEYPAD_VERSION, actions: Object.freeze(actions) })
}

function clearChildren(node) {
  while (node?.firstChild) node.removeChild(node.firstChild)
}

function appendPresentation(root, button, action) {
  const visual = root.createElement('span')
  visual.className = 'stage-prc-keypad-visual'
  visual.setAttribute('aria-hidden', 'true')
  if (action.glyph) {
    visual.classList.add('stage-prc-keypad-smufl')
    visual.dataset.smuflGlyphName = action.glyph.glyphName
    visual.textContent = action.glyph.character.repeat(action.glyph.repeat)
  } else {
    visual.classList.add(action.primitive.className)
    visual.dataset.hostPrimitive = action.primitive.className
    visual.textContent = action.primitive.text
  }
  button.appendChild(visual)
}

function normalizedPage(page) {
  return KEYPAD_PAGES.includes(page) ? page : 1
}

export function renderStagePrCKeypadShell(root, {
  manifest,
  glyphNames,
  exactSelectionReady = false,
  productSyncPending = false,
  advancedActionsReady = false,
  activePage = 1,
  onAction = null,
} = {}) {
  if (!root || typeof root.createElement !== 'function' || typeof root.getElementById !== 'function') return null
  const pageNow = normalizedPage(activePage)
  const model = buildStagePrCKeypadModel(manifest, glyphNames, { exactSelectionReady, productSyncPending, advancedActionsReady })
  let shell = root.getElementById('stage-prc-keypad')
  if (!shell) {
    const scoreColumn = root.getElementById('stage-s05-score-column')
    if (!scoreColumn) return null
    shell = root.createElement('section')
    shell.id = 'stage-prc-keypad'
    shell.className = 'stage-prc-keypad'
    shell.setAttribute('aria-label', 'Nota düzenleme tuş takımı')
    shell.dataset.sti = '08-10'
    scoreColumn.appendChild(shell)
  }
  clearChildren(shell)
  shell.dataset.page = String(pageNow)
  shell.dataset.exactSelectionReady = exactSelectionReady ? 'true' : 'false'
  shell.dataset.productSyncPending = productSyncPending ? 'true' : 'false'
  shell.dataset.advancedActionsReady = advancedActionsReady ? 'true' : 'false'

  const tabs = root.createElement('div')
  tabs.className = 'stage-prc-keypad-pages'
  tabs.setAttribute('role', 'tablist')
  for (const page of KEYPAD_PAGES) {
    const tab = root.createElement('button')
    tab.type = 'button'
    tab.className = 'stage-prc-keypad-page-button'
    tab.dataset.keypadPage = String(page)
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-selected', page === pageNow ? 'true' : 'false')
    tab.setAttribute('aria-label', `Nota tuş takımı sayfa ${page}`)
    tab.textContent = String(page)
    if (page !== pageNow) {
      tab.addEventListener('click', (event) => {
        event.stopPropagation?.()
        renderStagePrCKeypadShell(root, {
          manifest,
          glyphNames,
          exactSelectionReady,
          productSyncPending,
          advancedActionsReady,
          activePage: page,
          onAction,
        })
      })
    }
    tabs.appendChild(tab)
  }
  shell.appendChild(tabs)

  const panel = root.createElement('div')
  panel.className = 'stage-prc-keypad-panel'
  panel.setAttribute('role', 'tabpanel')
  panel.dataset.keypadPagePanel = String(pageNow)

  for (const action of model.actions.filter((item) => item.page === pageNow)) {
    const button = root.createElement('button')
    button.type = 'button'
    button.className = 'stage-prc-keypad-action'
    button.dataset.editorActionId = action.actionId
    button.setAttribute('aria-label', action.accessibleLabel)
    button.title = action.disabledReason ? `${action.accessibleLabel} — ${action.disabledReason}` : action.accessibleLabel
    button.disabled = !action.enabled
    if (action.disabledReason) button.dataset.disabledReason = action.disabledReason
    appendPresentation(root, button, action)
    if (action.enabled && typeof onAction === 'function') {
      button.addEventListener('click', (event) => {
        event.stopPropagation?.()
        onAction(action.actionId)
      })
    }
    panel.appendChild(button)
  }
  shell.appendChild(panel)

  const status = root.createElement('p')
  status.id = 'stage-prc-keypad-status'
  status.className = 'sr-only'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.textContent = productSyncPending
    ? 'Düzenleme işlendi. Skor senkronizasyonu bekleniyor.'
    : exactSelectionReady
      ? 'Exact nota seçildi. Nota düzenleme tuşları hazır.'
      : 'Nota düzenlemek için skordaki exact notaya dokunun.'
  shell.appendChild(status)

  const workspace = root.getElementById('stage-s05-score-workspace')
  workspace?.setAttribute('data-sti-prc-keypad-active', 'true')
  return Object.freeze({ shell, model })
}

export function removeStagePrCKeypadShell(root = document) {
  const shell = root?.getElementById?.('stage-prc-keypad')
  shell?.remove?.()
  root?.getElementById?.('stage-s05-score-workspace')?.removeAttribute?.('data-sti-prc-keypad-active')
  return Boolean(shell)
}
