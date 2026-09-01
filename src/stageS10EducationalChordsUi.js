// S10 — bounded educational chord workspace presentation.
//
// Package 7 remains the only owner of source MusicXML chord presentation and
// speech lifecycle. S10 only places that existing source-only panel beside a
// clearly separate generic education library inside the S05 score workspace.

import {
  ensureChordPanel,
  initPackage7Ui,
} from './package7Ui.js'

export const STAGE_S10_EDUCATIONAL_CHORDS = Object.freeze([
  'C',
  'Dm',
  'Em',
  'F',
  'G',
  'Am',
])

export const STAGE_S10_COPY = Object.freeze({
  heading: 'Akor Çalışma Alanı',
  help: 'Parçada yazılı akorlar yalnız MusicXML kaynak akor işaretlerinden gelir. Eğitim akorları ise parçadan bağımsız genel çalışma içeriğidir.',
  sourceHeading: 'Parçada Yazılı Akorlar',
  educationHeading: 'Eğitim Akorları',
  educationNote: 'Bu altı akor genel eğitim içeriğidir; açık parçadan çıkarılmamıştır ve parçanın armonisi olarak kabul edilmez.',
})

const protectedRoots = new WeakSet()

function validRoot(root) {
  return root &&
    typeof root.getElementById === 'function' &&
    typeof root.createElement === 'function'
}

function removeLegacyChordTab(root) {
  const button = root.getElementById('chord-tab-btn')
  if (!button) return true

  if (typeof button.remove === 'function') {
    button.remove()
    return true
  }

  button.hidden = true
  button.setAttribute?.('aria-hidden', 'true')
  button.setAttribute?.('tabindex', '-1')
  return true
}

function configureSourceGroup(root, panel) {
  panel.hidden = false
  panel.className = `${String(panel.className || '').trim()} stage-s10-source-chords`.trim()
  panel.setAttribute('data-stage-s10-source-group', 'true')
  panel.setAttribute('aria-labelledby', 'chord-heading')
  panel.removeAttribute?.('role')

  const heading = root.getElementById('chord-heading')
  const output = root.getElementById('chord-output')
  const actions = root.getElementById('chord-actions')
  const speak = root.getElementById('chord-speak-btn')
  const stop = root.getElementById('chord-stop-btn')

  if (heading) heading.textContent = STAGE_S10_COPY.sourceHeading
  if (output) output.setAttribute('aria-label', 'Parçada yazılı MusicXML kaynak akorları')
  if (actions) actions.setAttribute('aria-label', 'Parçada yazılı akorların seslendirme işlemleri')
  if (speak) {
    speak.textContent = '🔊 Yazılı akorları dinle'
    speak.setAttribute('aria-label', 'Parçada yazılı MusicXML kaynak akorlarını Türkçe seslendir')
  }
  if (stop) stop.setAttribute('aria-label', 'Parçada yazılı akorların seslendirmesini durdur')
  return panel
}

function keepWorkspaceSourceVisible(root) {
  if (protectedRoots.has(root)) return
  for (const tab of root.querySelectorAll?.('.tab-btn') ?? []) {
    if (tab.id === 'chord-tab-btn') continue
    tab.addEventListener?.('click', () => {
      const panel = root.getElementById('tab-chords')
      if (panel?.getAttribute?.('data-stage-s10-source-group') === 'true') panel.hidden = false
    })
  }
  protectedRoots.add(root)
}

function createEducationGroup(root) {
  const group = root.createElement('section')
  group.id = 'stage-s10-education-group'
  group.className = 'stage-s10-education-group'
  group.setAttribute('aria-labelledby', 'stage-s10-education-heading')

  const heading = root.createElement('h4')
  heading.id = 'stage-s10-education-heading'
  heading.textContent = STAGE_S10_COPY.educationHeading

  const note = root.createElement('p')
  note.id = 'stage-s10-education-note'
  note.className = 'stage-s10-education-note'
  note.textContent = STAGE_S10_COPY.educationNote

  const list = root.createElement('ul')
  list.id = 'stage-s10-education-list'
  list.className = 'stage-s10-education-list'
  list.setAttribute('aria-label', 'Genel eğitim akorları')

  for (const symbol of STAGE_S10_EDUCATIONAL_CHORDS) {
    const item = root.createElement('li')
    item.className = 'stage-s10-education-chord'
    item.setAttribute('data-stage-s10-educational-chord', symbol)
    item.setAttribute('aria-label', `Eğitim akoru ${symbol}`)
    item.textContent = symbol
    list.appendChild(item)
  }

  group.appendChild(heading)
  group.appendChild(note)
  group.appendChild(list)
  return group
}

function ensureWorkspaceShell(root) {
  const scoreColumn = root.getElementById('stage-s05-score-column')
  if (!scoreColumn) return null

  let section = root.getElementById('stage-s10-educational-chords')
  if (section) {
    if (section.parentElement !== scoreColumn) scoreColumn.appendChild(section)
    return section
  }

  section = root.createElement('section')
  section.id = 'stage-s10-educational-chords'
  section.className = 'stage-s10-educational-chords'
  section.setAttribute('aria-labelledby', 'stage-s10-educational-chords-heading')

  const heading = root.createElement('h3')
  heading.id = 'stage-s10-educational-chords-heading'
  heading.textContent = STAGE_S10_COPY.heading

  const help = root.createElement('p')
  help.id = 'stage-s10-educational-chords-help'
  help.className = 'stage-s10-educational-chords-help'
  help.textContent = STAGE_S10_COPY.help

  section.appendChild(heading)
  section.appendChild(help)
  scoreColumn.appendChild(section)
  return section
}

export function applyStageS10EducationalChordsUi(root = document) {
  if (!validRoot(root)) return false
  const shell = ensureWorkspaceShell(root)
  if (!shell) return false

  const sourcePanel = ensureChordPanel(root)
  if (!sourcePanel) return false
  configureSourceGroup(root, sourcePanel)
  if (sourcePanel.parentElement !== shell) shell.appendChild(sourcePanel)
  removeLegacyChordTab(root)
  keepWorkspaceSourceVisible(root)

  let education = root.getElementById('stage-s10-education-group')
  if (!education) {
    education = createEducationGroup(root)
    shell.appendChild(education)
  } else if (education.parentElement !== shell) {
    shell.appendChild(education)
  }

  shell.setAttribute('data-stage-s10-educational-chords', 'ready')
  return true
}

export function initStageS10EducationalChordsUi(root = document, adapters = {}) {
  const init = () => {
    const initSourceUi = adapters.initPackage7Ui ?? initPackage7Ui
    if (initSourceUi(root, adapters.package7Adapters ?? {}) !== true) return false
    return applyStageS10EducationalChordsUi(root)
  }

  if (root?.readyState === 'loading') {
    root.addEventListener?.('DOMContentLoaded', init, { once: true })
    return true
  }
  return init()
}
