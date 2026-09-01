// Stage I / S09 — accessible automatic Guitar TAB + Violin output rail.
//
// This is presentation/orchestration glue only. Package 4/5 remain the
// quality-gated rendering owners and Stage G remains the routing authority.
// The rail never invents quality evidence. After an Editor revision it may
// request Package 4/5 to recompute from the exact current selection projection;
// missing quality evidence therefore remains REVIEW/BLOCK rather than inheriting
// the source report.

import {
  getPackage3MeasureSnapshot,
  subscribePackage3Measures,
} from '../package3MeasureBridge.js'
import {
  resolveStageGConsumerRoute,
  STAGE_G_CONSUMER,
  STAGE_G_PRODUCT_STATE,
} from './services/stageGProductRouting.js'
import {
  stageIReasonCopy,
  STAGE_I_PRODUCT_COPY,
  STAGE_I_PRODUCT_STATE,
} from './services/stageIInstrumentProduct.js'
import {
  activateGuitarTabResultTab,
  renderGuitarTabPanel,
} from './package4Ui.js'
import {
  activateViolinResultTab,
  renderViolinPanel,
} from './package5Ui.js'

export const STAGE_I_UI_COPY = Object.freeze({
  heading: 'Çalgı Çıktıları',
  help: 'PASS olduğunda Gitar TAB ve Keman çıktısı otomatik görünür. REVIEW veya BLOCK durumunda kesin çıktı gösterilmez. Otomatik öneriler öğretmen onayı değildir.',
  guitarHeading: 'Gitar TAB',
  violinHeading: 'Keman',
  guitarAction: 'Gitar TAB sekmesini aç',
  violinAction: 'Keman sekmesini aç',
})

const rootSubscriptions = new WeakMap()
const actionStateByRoot = new WeakMap()
const renderStates = new WeakMap()

function validRoot(root) {
  return root &&
    typeof root.getElementById === 'function' &&
    typeof root.createElement === 'function'
}

function frozenRailModel(instrument, state, statusText, outputText = '', mode = null, reason = null) {
  return Object.freeze({
    instrument,
    state,
    reason,
    statusText,
    outputText: state === STAGE_I_PRODUCT_STATE.AVAILABLE ? outputText : '',
    mode,
    actionAllowed: state === STAGE_I_PRODUCT_STATE.AVAILABLE,
    definitiveInstrumentOutput: state === STAGE_I_PRODUCT_STATE.AVAILABLE,
    teacherReviewRequired: state === STAGE_I_PRODUCT_STATE.REVIEW_REQUIRED,
    blocked: state === STAGE_I_PRODUCT_STATE.BLOCKED || state === STAGE_I_PRODUCT_STATE.INVALID,
    teacherApproved: false,
    shareAuthorized: false,
    studentDeliveryAuthorized: false,
  })
}

function availableCopy(instrument) {
  return instrument === 'guitar'
    ? STAGE_I_PRODUCT_COPY.GUITAR_AVAILABLE
    : STAGE_I_PRODUCT_COPY.VIOLIN_AVAILABLE
}

function notAvailableCopy(instrument) {
  return instrument === 'guitar'
    ? STAGE_I_PRODUCT_COPY.GUITAR_NOT_AVAILABLE
    : STAGE_I_PRODUCT_COPY.VIOLIN_NOT_AVAILABLE
}

function routedCopy(state, reason) {
  const reasonCopy = stageIReasonCopy(reason)
  if (state === STAGE_I_PRODUCT_STATE.REVIEW_REQUIRED) {
    return reasonCopy
      ? `${STAGE_I_PRODUCT_COPY.REVIEW_REQUIRED} · ${reasonCopy}`
      : STAGE_I_PRODUCT_COPY.REVIEW_REQUIRED
  }
  return reasonCopy
    ? `${STAGE_I_PRODUCT_COPY.BLOCKED} · ${reasonCopy}`
    : STAGE_I_PRODUCT_COPY.BLOCKED
}

function readLegacyPresentation(root, instrument) {
  const guitar = instrument === 'guitar'
  const panel = root.getElementById(guitar ? 'tab-guitar-tab' : 'tab-violin')
  const output = root.getElementById(guitar ? 'guitar-tab-output' : 'violin-output')
  if (!panel || !output) return null

  const state = panel.getAttribute?.(guitar ? 'data-guitar-tab-state' : 'data-violin-state') ?? null
  const mode = panel.getAttribute?.(guitar ? 'data-guitar-tab-mode' : 'data-violin-mode') ?? null
  const text = output.hidden === false && typeof output.textContent === 'string'
    ? output.textContent.trim()
    : ''
  return Object.freeze({ state, mode, text })
}

/**
 * Product routing follows the current immutable editor revision when S07 has
 * bound a verified selection projection. `notes` remains the source/quality
 * identity; using `selectionNotes` here never transfers the source report.
 */
export function stageICurrentRoutingNotes(snapshot) {
  if (!Array.isArray(snapshot?.notes)) return null
  if (
    Array.isArray(snapshot.selectionNotes) &&
    snapshot.revisionIdentity &&
    snapshot.selectionNotes.length === snapshot.notes.length
  ) return snapshot.selectionNotes
  return snapshot.notes
}

function productFromCurrentPresentation(root, notes, instrument, routeResolver, stageGOptions = {}) {
  if (!Array.isArray(notes)) {
    return frozenRailModel(instrument, STAGE_I_PRODUCT_STATE.INVALID, STAGE_I_PRODUCT_COPY.BLOCKED, '', null, 'canonical-note-array-required')
  }
  if (notes.length === 0) {
    return frozenRailModel(instrument, STAGE_I_PRODUCT_STATE.EMPTY, STAGE_I_PRODUCT_COPY.EMPTY, '', null, 'canonical-note-array-empty')
  }

  const consumer = instrument === 'guitar' ? STAGE_G_CONSUMER.GUITAR_TAB : STAGE_G_CONSUMER.VIOLIN
  let route
  try {
    route = routeResolver(notes, consumer, stageGOptions)
  } catch {
    return frozenRailModel(instrument, STAGE_I_PRODUCT_STATE.INVALID, STAGE_I_PRODUCT_COPY.BLOCKED, '', null, 'stage-g-route-resolution-failed')
  }

  if (route?.state === STAGE_G_PRODUCT_STATE.REVIEW) {
    const reason = route.reason ?? 'stage-g-review'
    return frozenRailModel(instrument, STAGE_I_PRODUCT_STATE.REVIEW_REQUIRED, routedCopy(STAGE_I_PRODUCT_STATE.REVIEW_REQUIRED, reason), '', null, reason)
  }
  if (route?.state !== STAGE_G_PRODUCT_STATE.PASS) {
    const reason = route?.reason ?? 'stage-g-block'
    return frozenRailModel(instrument, STAGE_I_PRODUCT_STATE.BLOCKED, routedCopy(STAGE_I_PRODUCT_STATE.BLOCKED, reason), '', null, reason)
  }
  if (route.automaticProceed !== true || route.definitiveConsumerAllowed !== true) {
    return frozenRailModel(instrument, STAGE_I_PRODUCT_STATE.INVALID, STAGE_I_PRODUCT_COPY.BLOCKED, '', null, 'stage-g-pass-permission-mismatch')
  }

  const presentation = readLegacyPresentation(root, instrument)
  if (!presentation) {
    return frozenRailModel(instrument, STAGE_I_PRODUCT_STATE.INVALID, STAGE_I_PRODUCT_COPY.BLOCKED, '', null, 'instrument-presentation-not-ready')
  }

  if (presentation.state === 'rendered' && presentation.text.length > 0) {
    return frozenRailModel(
      instrument,
      STAGE_I_PRODUCT_STATE.AVAILABLE,
      availableCopy(instrument),
      presentation.text,
      presentation.mode === 'advanced' ? 'advanced' : 'basic',
      null,
    )
  }
  if (presentation.state === 'not-available') {
    return frozenRailModel(instrument, STAGE_I_PRODUCT_STATE.NOT_AVAILABLE, notAvailableCopy(instrument), '', null, 'instrument-output-not-available')
  }

  return frozenRailModel(instrument, STAGE_I_PRODUCT_STATE.INVALID, STAGE_I_PRODUCT_COPY.BLOCKED, '', null, 'instrument-presentation-mismatch')
}

function resolveRailProducts(root, notes, adapters = {}) {
  if (typeof adapters.resolveStageIInstrumentProducts === 'function') {
    return adapters.resolveStageIInstrumentProducts(notes, adapters.productOptions ?? {})
  }

  const current = getPackage3MeasureSnapshot()
  if (stageICurrentRoutingNotes(current) !== notes) {
    const invalid = frozenRailModel('guitar', STAGE_I_PRODUCT_STATE.INVALID, STAGE_I_PRODUCT_COPY.BLOCKED, '', null, 'stale-current-revision-note-array')
    return Object.freeze({
      guitar: invalid,
      violin: Object.freeze({ ...invalid, instrument: 'violin' }),
      teacherApproved: false,
      shareAuthorized: false,
      studentDeliveryAuthorized: false,
    })
  }

  const routeResolver = adapters.resolveStageGConsumerRoute ?? resolveStageGConsumerRoute
  return Object.freeze({
    guitar: productFromCurrentPresentation(root, notes, 'guitar', routeResolver, adapters.stageGOptions ?? {}),
    violin: productFromCurrentPresentation(root, notes, 'violin', routeResolver, adapters.stageGOptions ?? {}),
    teacherApproved: false,
    shareAuthorized: false,
    studentDeliveryAuthorized: false,
  })
}

function setButtonState(button, model) {
  if (!button || !model) return
  const allowed = model.actionAllowed === true && model.state === STAGE_I_PRODUCT_STATE.AVAILABLE
  button.disabled = !allowed
  button.setAttribute('aria-disabled', allowed ? 'false' : 'true')
  button.setAttribute('data-stage-i-state', model.state)
}

function createInstrumentCard(root, instrument, headingText, actionLabel) {
  const card = root.createElement('div')
  card.className = 'stage-i-instrument-card'
  card.setAttribute('data-stage-i-instrument', instrument)

  const heading = root.createElement('h4')
  heading.id = `stage-i-${instrument}-heading`
  heading.textContent = headingText

  const status = root.createElement('div')
  status.id = `stage-i-${instrument}-status`
  status.className = 'stage-i-instrument-status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.textContent = STAGE_I_PRODUCT_COPY.EMPTY

  const output = root.createElement('pre')
  output.id = `stage-i-${instrument}-output`
  output.className = 'stage-i-instrument-output'
  output.hidden = true
  output.setAttribute('tabindex', '0')
  output.setAttribute('aria-label', instrument === 'guitar' ? 'Otomatik Gitar TAB çıktısı' : 'Otomatik keman çalışma çıktısı')

  const button = root.createElement('button')
  button.id = `stage-i-${instrument}-action`
  button.type = 'button'
  button.className = 'btn btn-secondary stage-i-instrument-action'
  button.textContent = actionLabel
  button.disabled = true
  button.setAttribute('aria-disabled', 'true')
  button.setAttribute('aria-describedby', `stage-i-${instrument}-status`)

  card.appendChild(heading)
  card.appendChild(status)
  card.appendChild(output)
  card.appendChild(button)
  return card
}

function moveSectionToPreferredHost(root, section) {
  const scoreColumn = root.getElementById('stage-s05-score-column')
  if (scoreColumn) {
    if (section.parentElement !== scoreColumn) scoreColumn.appendChild(section)
    return section
  }

  const tabList = root.querySelector?.('.result-tabs') ?? null
  const host = tabList?.parentElement ?? null
  if (!tabList || !host) return null
  if (section.parentElement !== host) host.insertBefore(section, tabList)
  return section
}

export function ensureStageIInstrumentProductUi(root = document, adapters = {}) {
  if (!validRoot(root)) return null
  const existing = root.getElementById('stage-i-instrument-products')
  if (existing) return moveSectionToPreferredHost(root, existing)

  const tabList = root.querySelector?.('.result-tabs') ?? null
  const scoreColumn = root.getElementById('stage-s05-score-column')
  const fallbackHost = tabList?.parentElement ?? null
  if (!scoreColumn && (!tabList || !fallbackHost)) return null

  const section = root.createElement('section')
  section.id = 'stage-i-instrument-products'
  section.className = 'stage-i-instrument-products'
  section.setAttribute('aria-labelledby', 'stage-i-instrument-heading')

  const heading = root.createElement('h3')
  heading.id = 'stage-i-instrument-heading'
  heading.textContent = STAGE_I_UI_COPY.heading

  const help = root.createElement('p')
  help.id = 'stage-i-instrument-help'
  help.className = 'stage-i-instrument-help'
  help.textContent = STAGE_I_UI_COPY.help

  const grid = root.createElement('div')
  grid.className = 'stage-i-instrument-grid'
  grid.appendChild(createInstrumentCard(root, 'guitar', STAGE_I_UI_COPY.guitarHeading, STAGE_I_UI_COPY.guitarAction))
  grid.appendChild(createInstrumentCard(root, 'violin', STAGE_I_UI_COPY.violinHeading, STAGE_I_UI_COPY.violinAction))

  section.appendChild(heading)
  section.appendChild(help)
  section.appendChild(grid)
  if (scoreColumn) scoreColumn.appendChild(section)
  else fallbackHost.insertBefore(section, tabList)

  const guitarButton = root.getElementById('stage-i-guitar-action')
  const violinButton = root.getElementById('stage-i-violin-action')
  const activateGuitar = adapters.activateGuitarTabResultTab ?? activateGuitarTabResultTab
  const activateViolin = adapters.activateViolinResultTab ?? activateViolinResultTab

  guitarButton?.addEventListener?.('click', () => {
    const state = actionStateByRoot.get(root)?.guitar
    if (state?.actionAllowed === true && state.state === STAGE_I_PRODUCT_STATE.AVAILABLE) activateGuitar(root)
  })
  violinButton?.addEventListener?.('click', () => {
    const state = actionStateByRoot.get(root)?.violin
    if (state?.actionAllowed === true && state.state === STAGE_I_PRODUCT_STATE.AVAILABLE) activateViolin(root)
  })

  return section
}

export function renderStageIInstrumentProductUi(root, notes, adapters = {}) {
  const section = ensureStageIInstrumentProductUi(root, adapters)
  if (!section) return null

  let products
  try {
    products = resolveRailProducts(root, notes, adapters)
  } catch {
    products = Object.freeze({
      guitar: frozenRailModel('guitar', STAGE_I_PRODUCT_STATE.INVALID, STAGE_I_PRODUCT_COPY.BLOCKED),
      violin: frozenRailModel('violin', STAGE_I_PRODUCT_STATE.INVALID, STAGE_I_PRODUCT_COPY.BLOCKED),
    })
  }

  actionStateByRoot.set(root, products)

  for (const instrument of ['guitar', 'violin']) {
    const model = products?.[instrument]
    const button = root.getElementById(`stage-i-${instrument}-action`)
    const status = root.getElementById(`stage-i-${instrument}-status`)
    const output = root.getElementById(`stage-i-${instrument}-output`)
    setButtonState(button, model)
    if (status) status.textContent = typeof model?.statusText === 'string'
      ? model.statusText
      : STAGE_I_PRODUCT_COPY.BLOCKED
    if (output) {
      const visible = model?.state === STAGE_I_PRODUCT_STATE.AVAILABLE && typeof model?.outputText === 'string' && model.outputText.trim().length > 0
      output.textContent = visible ? model.outputText : ''
      output.hidden = !visible
    }
    const card = button?.parentElement ?? output?.parentElement ?? null
    card?.setAttribute?.('data-stage-i-state', model?.state ?? STAGE_I_PRODUCT_STATE.INVALID)
    card?.setAttribute?.('data-stage-i-mode', model?.mode ?? 'none')
  }

  return products
}

function refreshCurrentRevisionPresentations(root, snapshot, adapters) {
  if (typeof adapters.resolveStageIInstrumentProducts === 'function') return stageICurrentRoutingNotes(snapshot)
  const notes = stageICurrentRoutingNotes(snapshot)
  if (!Array.isArray(notes)) return notes

  // Package 4/5 already process the source `snapshot.notes` synchronously.
  // Only a distinct current editor projection needs an explicit recompute.
  if (notes !== snapshot.notes) {
    renderGuitarTabPanel(root, notes, adapters.guitarPanelAdapters ?? {})
    renderViolinPanel(root, notes, adapters.violinPanelAdapters ?? {})
  }
  return notes
}

function scheduleStageIRender(root, state, snapshot, adapters) {
  state.latestSnapshot = snapshot
  if (state.scheduled) return false
  state.scheduled = true
  queueMicrotask(() => {
    state.scheduled = false
    const latest = state.latestSnapshot ?? getPackage3MeasureSnapshot()
    state.latestSnapshot = null
    const notes = refreshCurrentRevisionPresentations(root, latest, adapters)
    renderStageIInstrumentProductUi(root, notes, adapters)
  })
  return true
}

function renderStageIAdapterSnapshotNow(root, snapshot, adapters) {
  const notes = stageICurrentRoutingNotes(snapshot)
  renderStageIInstrumentProductUi(root, notes, adapters)
  return true
}

export function initStageIInstrumentProductUi(root = document, adapters = {}) {
  const init = () => {
    if (!ensureStageIInstrumentProductUi(root, adapters)) return false

    const oldUnsubscribe = rootSubscriptions.get(root)
    if (oldUnsubscribe) oldUnsubscribe()

    let state = renderStates.get(root)
    if (!state) {
      state = { scheduled: false, latestSnapshot: null }
      renderStates.set(root, state)
    }

    // Test/custom product adapters are an existing public orchestration seam and
    // historically receive Package 3 snapshots synchronously. Preserve that
    // contract. Production routing keeps microtask coalescing so revision bursts
    // cannot multiply Package 4/5 recomputation.
    const synchronousAdapter = typeof adapters.resolveStageIInstrumentProducts === 'function'
    const unsubscribe = subscribePackage3Measures((snapshot) => {
      if (synchronousAdapter) renderStageIAdapterSnapshotNow(root, snapshot, adapters)
      else scheduleStageIRender(root, state, snapshot, adapters)
    })
    rootSubscriptions.set(root, unsubscribe)

    if (!synchronousAdapter) scheduleStageIRender(root, state, getPackage3MeasureSnapshot(), adapters)
    return true
  }

  if (root?.readyState === 'loading') {
    root.addEventListener?.('DOMContentLoaded', init, { once: true })
    return true
  }
  return init()
}
