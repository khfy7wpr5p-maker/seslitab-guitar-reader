import {
  getPackage3MeasureSnapshot,
  selectPackage3NoteIndex,
  subscribePackage3Measures,
} from '../package3MeasureBridge.js'
import { buildCanonicalNoteControlModels } from './services/canonicalNoteSelection.js'

const boundRoots = new WeakSet()

function announce(root, message) {
  const live = root.getElementById('aria-live-region')
  if (live) live.textContent = message
}

function ensureNoteControls(root) {
  const measureRegion = root.getElementById('measure-controls')
  if (!measureRegion || typeof root.createElement !== 'function') return null

  let region = root.getElementById('stage-c-note-selection')
  if (region) return region

  region = root.createElement('section')
  region.id = 'stage-c-note-selection'
  region.className = 'measure-controls stage-c-note-selection'
  region.setAttribute('aria-labelledby', 'stage-c-note-selection-heading')
  region.hidden = true

  const heading = root.createElement('h4')
  heading.id = 'stage-c-note-selection-heading'
  heading.textContent = 'Nota seçimi'

  const help = root.createElement('p')
  help.id = 'stage-c-note-selection-help'
  help.textContent = 'Seçim, mevcut eserdeki exact canonical nota kaydına ve güvenli görsel nota kimliğine bağlıdır. Pitch etiketi, yakınlık veya nearest-note tahmini kullanılmaz; kesin eşleme yoksa sistem seçim üretmez.'

  const group = root.createElement('div')
  group.id = 'stage-c-note-buttons'
  group.className = 'measure-control-buttons'
  group.setAttribute('role', 'group')
  group.setAttribute('aria-label', 'Düzeltilecek notayı seç')
  group.setAttribute('aria-describedby', 'stage-c-note-selection-help')

  region.appendChild(heading)
  region.appendChild(help)
  region.appendChild(group)
  measureRegion.appendChild(region)
  return region
}

export function renderStageCNoteSelection(root, snapshot) {
  if (!root || typeof root.getElementById !== 'function') return false
  const region = ensureNoteControls(root)
  if (!region) return false

  const group = root.getElementById('stage-c-note-buttons')
  if (!group || typeof group.replaceChildren !== 'function') return false

  const models = buildCanonicalNoteControlModels(
    snapshot?.notes,
    snapshot?.selectedMeasureKey,
    snapshot?.selectedNoteIndex,
  )

  group.replaceChildren()
  if (models.length === 0) {
    region.hidden = true
    return true
  }

  for (const model of models) {
    const button = root.createElement('button')
    button.type = 'button'
    button.className = 'btn btn-secondary btn-sm stage-c-note-select-btn'
    button.textContent = model.visibleLabel
    button.setAttribute('aria-label', model.ariaLabel)
    button.setAttribute('aria-pressed', model.selected ? 'true' : 'false')
    button.setAttribute('data-note-index', String(model.noteIndex))

    button.addEventListener('click', () => {
      const current = getPackage3MeasureSnapshot()
      if (current.notes !== snapshot.notes) return
      if (current.selectedMeasureKey !== snapshot.selectedMeasureKey) return
      // S06 exact-selection boundary: keyboard/mouse activation of this native
      // button is accepted only when this exact canonical note also has a safe
      // ScoreNoteRef. Incomplete/ambiguous renderer identity abstains.
      if (!model.rendererTarget) return
      if (!selectPackage3NoteIndex(model.noteIndex, {
        rendererTarget: model.rendererTarget,
        interaction: 'canonical-control',
      })) return
      announce(root, `${model.visibleLabel} exact canonical nota olarak seçildi.`)
    })
    group.appendChild(button)
  }

  region.hidden = false
  return true
}

export function initStageCNoteSelection(root = document) {
  if (!root || typeof root.getElementById !== 'function' || boundRoots.has(root)) return false
  boundRoots.add(root)
  subscribePackage3Measures((snapshot) => {
    renderStageCNoteSelection(root, snapshot)
  })
  return true
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initStageCNoteSelection(document), { once: true })
  } else {
    initStageCNoteSelection(document)
  }
}
