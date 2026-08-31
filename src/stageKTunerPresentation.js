// Stage K — presentation-only compact tuner surface.
//
// Package 11 remains the sole microphone/pitch-analysis authority. This module
// only changes visible copy and groups existing secondary controls/readouts.
// It never opens the microphone, analyzes audio, changes calibration values,
// changes tuner thresholds, uploads audio, or introduces network behavior.

export const STAGE_K_TUNER_COPY = Object.freeze({
  title: 'Akort',
  subtitle: 'Bir nota çalın. Mikrofon sesi yalnızca cihazınızda analiz edilir.',
  details: 'Ayarlar ve ölçümler',
  privacy: 'Mikrofon sesi SesliTab sunucusuna gönderilmez, kaydedilmez veya saklanmaz.',
})

function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value
}

function ensurePrivacyNote(root, section, body) {
  let note = root.getElementById('stage-k-tuner-privacy')
  if (note) return note

  note = root.createElement('p')
  note.id = 'stage-k-tuner-privacy'
  note.className = 'stage-k-tuner-privacy'
  note.textContent = STAGE_K_TUNER_COPY.privacy

  const controls = section.querySelector?.('.tuner-controls') ?? null
  if (controls?.parentElement === body && typeof body.insertBefore === 'function') {
    body.insertBefore(note, controls)
  } else {
    body.appendChild(note)
  }
  return note
}

function ensureSecondaryDetails(root, section, body) {
  let details = root.getElementById('stage-k-tuner-details')
  if (!details) {
    details = root.createElement('details')
    details.id = 'stage-k-tuner-details'
    details.className = 'stage-k-tuner-details'

    const summary = root.createElement('summary')
    summary.id = 'stage-k-tuner-details-summary'
    summary.textContent = STAGE_K_TUNER_COPY.details
    details.appendChild(summary)

    const status = root.getElementById('tuner-status')
    if (status?.parentElement === body && typeof body.insertBefore === 'function') {
      body.insertBefore(details, status)
    } else {
      body.appendChild(details)
    }
  } else {
    setText(details.querySelector?.('summary') ?? null, STAGE_K_TUNER_COPY.details)
  }

  const calibration = section.querySelector?.('.tuner-calibration') ?? null
  const readout = section.querySelector?.('.tuner-readout') ?? null
  const help = section.querySelector?.('.tuner-help') ?? null
  const badge = section.querySelector?.('.tuner-badge') ?? null

  for (const node of [calibration, readout, help, badge]) {
    if (node && node.parentElement !== details) details.appendChild(node)
  }

  return details
}

export function applyStageKTunerPresentation(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  const section = root.getElementById('chromatic-tuner-section')
  if (!section) return false

  const body = section.querySelector?.('.tuner-body') ?? null
  if (!body) return false

  setText(root.getElementById('chromatic-tuner-heading'), STAGE_K_TUNER_COPY.title)
  setText(section.querySelector?.('.tuner-subtitle') ?? null, STAGE_K_TUNER_COPY.subtitle)

  ensurePrivacyNote(root, section, body)
  ensureSecondaryDetails(root, section, body)

  section.setAttribute?.('data-stage-k-presentation', 'ready')
  return true
}

export function initStageKTunerPresentation(root = document) {
  const init = () => applyStageKTunerPresentation(root)
  if (root?.readyState === 'loading') {
    root.addEventListener?.('DOMContentLoaded', init, { once: true })
    return true
  }
  return init()
}
