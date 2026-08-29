export const APP_SHELL_FEATURES = Object.freeze([
  Object.freeze({ id: 'workspace', label: 'Çalışma Alanı', targetId: 'input-section', kind: 'section' }),
  Object.freeze({ id: 'discovery', label: 'Nota Ara', targetId: 'input-section', controlId: 'discovery-tab-btn', kind: 'tab' }),
  Object.freeze({ id: 'tuner', label: 'Akort', targetId: 'chromatic-tuner-section', kind: 'section' }),
])

function announce(root, message) {
  const live = root.getElementById('aria-live-region')
  if (live) live.textContent = message
}

function focusTarget(target) {
  if (!target) return false
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  target.hidden = false
  target.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  target.focus?.({ preventScroll: true })
  return true
}

export function activateAppShellFeature(root, featureId) {
  const feature = APP_SHELL_FEATURES.find((item) => item.id === featureId)
  if (!feature) return false

  const control = feature.controlId ? root.getElementById(feature.controlId) : null
  if (control) control.click()

  const target = root.getElementById(feature.targetId)
  if (!target) {
    announce(root, `${feature.label} henüz bu ekranda kullanılamıyor.`)
    return false
  }

  const activated = focusTarget(target)
  if (activated) announce(root, `${feature.label} açıldı.`)
  return activated
}

function createFeatureButton(root, feature) {
  const button = root.createElement('button')
  button.type = 'button'
  button.className = 'app-shell-nav-button'
  button.dataset.feature = feature.id
  button.textContent = feature.label
  button.setAttribute('aria-controls', feature.targetId)
  button.addEventListener('click', () => activateAppShellFeature(root, feature.id))
  return button
}

function createProductIntro(root) {
  const card = root.createElement('section')
  card.className = 'app-shell-status'
  card.setAttribute('aria-labelledby', 'app-shell-status-heading')

  const heading = root.createElement('h2')
  heading.id = 'app-shell-status-heading'
  heading.textContent = 'SesliTab çalışma alanı'
  card.appendChild(heading)

  const text = root.createElement('p')
  text.textContent = 'Bir eser açın, nota kaynağı arayın veya akort aracını kullanın. Hesap ve gerçek öğrenci paylaşımı henüz etkin değildir.'
  card.appendChild(text)

  return card
}

export function ensureAppShell(root = document) {
  if (root.getElementById('seslitab-app-shell')) return root.getElementById('seslitab-app-shell')

  const header = root.querySelector('.app-header')
  const main = root.querySelector('.app-main')
  if (!header || !main?.parentElement) return null

  const shell = root.createElement('div')
  shell.id = 'seslitab-app-shell'
  shell.className = 'app-shell'

  const nav = root.createElement('nav')
  nav.className = 'app-shell-nav'
  nav.setAttribute('aria-label', 'SesliTab ana bölümleri')

  const navLabel = root.createElement('span')
  navLabel.className = 'app-shell-nav-label'
  navLabel.textContent = 'SesliTab'
  nav.appendChild(navLabel)

  for (const feature of APP_SHELL_FEATURES) nav.appendChild(createFeatureButton(root, feature))
  shell.appendChild(nav)
  shell.appendChild(createProductIntro(root))

  main.parentElement.insertBefore(shell, main)
  return shell
}

export function initAppShell(root = document) {
  const init = () => ensureAppShell(root)
  if (root.readyState === 'loading') root.addEventListener('DOMContentLoaded', init, { once: true })
  else init()
}

if (typeof document !== 'undefined') initAppShell(document)
