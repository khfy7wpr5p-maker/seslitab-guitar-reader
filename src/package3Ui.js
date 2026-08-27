// Package 3 — accessible playback/interface controller.
//
// Package 3A deliberately changes only the user-facing wording of the
// existing rhythmic playback control. Playback semantics remain untouched in
// this slice; later Package 3 stages extend this module behind separate gates.

export const MUSIC_LISTEN_LABELS = Object.freeze({
  heading: 'Müziği Dinle',
  button: '🎵 Müziği Dinle',
  ariaLabel: 'Müziği dinlemeyi başlat',
})

export function applyMusicListenLabels(root) {
  if (!root || typeof root.getElementById !== 'function') return false

  const heading = root.getElementById('rhythm-heading')
  const button = root.getElementById('rhythm-btn')
  const text = button?.querySelector?.('.btn-icon-text') ?? null

  if (!heading || !button || !text) return false

  heading.textContent = MUSIC_LISTEN_LABELS.heading
  button.setAttribute('aria-label', MUSIC_LISTEN_LABELS.ariaLabel)
  text.textContent = MUSIC_LISTEN_LABELS.button
  return true
}

export function initPackage3Ui(root = document) {
  return applyMusicListenLabels(root)
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initPackage3Ui(document)
  })
}
