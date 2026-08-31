// Stage I — accessible Guitar TAB + Violin product actions.
//
// This is presentation/routing glue only. It consumes the exact Package 3
// NoteObject[] reference and the Stage I product result. Existing Package 4/5
// tabs remain the rendering surfaces; Stage I only exposes an action when the
// exact instrument route is safely available.

import {
  getPackage3MeasureSnapshot,
  subscribePackage3Measures,
} from '../package3MeasureBridge.js'
import {
  resolveStageIInstrumentProducts,
  STAGE_I_PRODUCT_STATE,
} from './services/stageIInstrumentProduct.js'
import { activateGuitarTabResultTab } from './package4Ui.js'
import { activateViolinResultTab } from './package5Ui.js'

export const STAGE_I_UI_COPY = Object.freeze({
  heading: 'Çalgı Çalışması',
  help: 'Yalnız güvenli ve desteklenen çalgı çıktıları açılır. Otomatik öneriler öğretmen onayı değildir.',
  guitarAction: "Gitar TAB'ı Aç",
  violinAction: 'Keman Çalışmasını Aç',
})

const rootSubscriptions = new WeakMap()
const actionStateByRoot = new WeakMap()

function validRoot(root) {
  return root &&
    typeof root.getElementById === 'function' &&
    typeof root.createElement === 'function'
}

function setButtonState(button, model) {
  if (!button || !model) return
  const allowed = model.actionAllowed === true && model.state === STAGE_I_PRODUCT_STATE.AVAILABLE
  button.disabled = !allowed
  button.setAttribute('aria-disabled', allowed ? 'false' : 'true')
  button.setAttribute('data-stage-i-state', model.state)
}

function createInstrumentCard(root, instrument, label) {
  const card = root.createElement('div')
  card.className = 'stage-i-instrument-card'
  card.setAttribute('data-stage-i-instrument', instrument)

  const button = root.createElement('button')
  button.id = `stage-i-${instrument}-action`
  button.type = 'button'
  button.className = 'btn btn-secondary stage-i-instrument-action'
  button.textContent = label
  button.disabled = true
  button.setAttribute('aria-disabled', 'true')
  button.setAttribute('aria-describedby', `stage-i-${instrument}-status`)

  const status = root.createElement('div')
  status.id = `stage-i-${instrument}-status`
  status.className = 'stage-i-instrument-status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.textContent = 'Önce bir eser açın.'

  card.appendChild(button)
  card.appendChild(status)
  return card
}

export function ensureStageIInstrumentProductUi(root = document, adapters = {}) {
  if (!validRoot(root)) return null
  const existing = root.getElementById('stage-i-instrument-products')
  if (existing) return existing

  const tabList = root.querySelector?.('.result-tabs') ?? null
  const host = tabList?.parentElement ?? null
  if (!tabList || !host) return null

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
  grid.appendChild(createInstrumentCard(root, 'guitar', STAGE_I_UI_COPY.guitarAction))
  grid.appendChild(createInstrumentCard(root, 'violin', STAGE_I_UI_COPY.violinAction))

  section.appendChild(heading)
  section.appendChild(help)
  section.appendChild(grid)
  host.insertBefore(section, tabList)

  const guitarButton = root.getElementById('stage-i-guitar-action')
  const violinButton = root.getElementById('stage-i-violin-action')
  const activateGuitar = adapters.activateGuitarTabResultTab ?? activateGuitarTabResultTab
  const activateViolin = adapters.activateViolinResultTab ?? activateViolinResultTab

  guitarButton?.addEventListener?.('click', () => {
    const state = actionStateByRoot.get(root)?.guitar
    if (state?.actionAllowed === true && state.state === STAGE_I_PRODUCT_STATE.AVAILABLE) {
      activateGuitar(root)
    }
  })
  violinButton?.addEventListener?.('click', () => {
    const state = actionStateByRoot.get(root)?.violin
    if (state?.actionAllowed === true && state.state === STAGE_I_PRODUCT_STATE.AVAILABLE) {
      activateViolin(root)
    }
  })

  return section
}

export function renderStageIInstrumentProductUi(root, notes, adapters = {}) {
  const section = ensureStageIInstrumentProductUi(root, adapters)
  if (!section) return null

  const resolveProducts = adapters.resolveStageIInstrumentProducts ?? resolveStageIInstrumentProducts
  let products
  try {
    products = resolveProducts(notes, adapters.productOptions ?? {})
  } catch {
    products = Object.freeze({
      guitar: Object.freeze({
        state: STAGE_I_PRODUCT_STATE.INVALID,
        actionAllowed: false,
        statusText: 'Kullanım engellendi',
      }),
      violin: Object.freeze({
        state: STAGE_I_PRODUCT_STATE.INVALID,
        actionAllowed: false,
        statusText: 'Kullanım engellendi',
      }),
    })
  }

  actionStateByRoot.set(root, products)

  for (const instrument of ['guitar', 'violin']) {
    const model = products?.[instrument]
    const button = root.getElementById(`stage-i-${instrument}-action`)
    const status = root.getElementById(`stage-i-${instrument}-status`)
    setButtonState(button, model)
    if (status) status.textContent = typeof model?.statusText === 'string'
      ? model.statusText
      : 'Kullanım engellendi'
    const card = button?.parentElement ?? null
    card?.setAttribute?.('data-stage-i-state', model?.state ?? STAGE_I_PRODUCT_STATE.INVALID)
  }

  return products
}

export function initStageIInstrumentProductUi(root = document, adapters = {}) {
  const init = () => {
    if (!ensureStageIInstrumentProductUi(root, adapters)) return false

    const oldUnsubscribe = rootSubscriptions.get(root)
    if (oldUnsubscribe) oldUnsubscribe()

    const unsubscribe = subscribePackage3Measures((snapshot) => {
      renderStageIInstrumentProductUi(root, snapshot?.notes ?? null, adapters)
    })
    rootSubscriptions.set(root, unsubscribe)

    const current = getPackage3MeasureSnapshot()
    renderStageIInstrumentProductUi(root, current.notes, adapters)
    return true
  }

  if (root?.readyState === 'loading') {
    root.addEventListener?.('DOMContentLoaded', init, { once: true })
    return true
  }
  return init()
}
