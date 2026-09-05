export const APP_SHELL_FEATURES = Object.freeze([
  Object.freeze({ id: 'workspace', label: 'Çalışma Alanı', targetId: 'input-section', kind: 'section' }),
  Object.freeze({ id: 'tuner', label: 'Akort', targetId: 'chromatic-tuner-section', kind: 'section' }),
])

const boundDiscoveryForms = new WeakSet()

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

function findLabel(root, controlId) {
  const labels = root.querySelectorAll?.('label') ?? []
  for (const label of labels) {
    if (label.getAttribute?.('for') === controlId) return label
  }
  return null
}

function appendClass(node, className) {
  const values = new Set(String(node?.className || '').split(/\s+/).filter(Boolean))
  values.add(className)
  if (node) node.className = [...values].join(' ')
}

function compactIdentity(root, header) {
  const logo = header.querySelector?.('.logo') ?? null
  const heading = logo?.querySelector?.('h1') ?? null
  const subtitle = logo?.querySelector?.('.logo-subtitle') ?? null

  if (heading) heading.textContent = 'SesliTab Guitar Reader'
  if (subtitle) {
    subtitle.hidden = true
    subtitle.setAttribute?.('hidden', '')
  }
  header.setAttribute?.('data-stage-s03-shell', 'ready')
}

function retireDiscoveryTab(root) {
  const tab = root.getElementById?.('discovery-tab-btn')
  if (!tab) return false
  tab.remove?.()
  return true
}

function revealDiscoveryOnSearch(root, form) {
  if (!form?.addEventListener || boundDiscoveryForms.has(form)) return
  boundDiscoveryForms.add(form)

  form.addEventListener('submit', () => {
    const panel = root.getElementById('discovery-panel')
    if (panel) {
      panel.hidden = false
      panel.removeAttribute?.('aria-hidden')
      panel.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    }
    retireDiscoveryTab(root)
  })
}

function moveDiscoverySearch(root, shell) {
  const form = root.getElementById('discovery-search-form')
  const query = root.getElementById('discovery-query')
  const searchButton = root.getElementById('discovery-search-btn')
  const queryRow = query?.parentElement ?? null
  const label = findLabel(root, 'discovery-query')

  if (!form || !query || !searchButton || !queryRow || !label) return false

  appendClass(label, 'app-shell-search-label')
  appendClass(queryRow, 'app-shell-search-row')
  query.setAttribute?.('form', form.id)
  searchButton.setAttribute?.('form', form.id)

  shell.appendChild(label)
  shell.appendChild(queryRow)
  revealDiscoveryOnSearch(root, form)
  retireDiscoveryTab(root)
  queueMicrotask(() => retireDiscoveryTab(root))
  return true
}

export function ensureAppShell(root = document) {
  const existing = root.getElementById('seslitab-app-shell')
  if (existing) return existing

  const header = root.querySelector('.app-header')
  const headerContent = header?.querySelector?.('.header-content') ?? null
  if (!header || !headerContent) return null

  compactIdentity(root, header)

  const shell = root.createElement('div')
  shell.id = 'seslitab-app-shell'
  shell.className = 'app-shell'
  shell.setAttribute('role', 'search')
  shell.setAttribute('aria-label', 'Eser veya sanatçı ara')

  if (!moveDiscoverySearch(root, shell)) return null

  const providerBadge = root.getElementById('provider-badge')
  if (providerBadge?.parentElement === headerContent && typeof headerContent.insertBefore === 'function') {
    headerContent.insertBefore(shell, providerBadge)
  } else {
    headerContent.appendChild(shell)
  }

  return shell
}

export function initAppShell(root = document) {
  const init = () => ensureAppShell(root)
  if (root.readyState === 'loading') root.addEventListener('DOMContentLoaded', init, { once: true })
  else init()
}

if (typeof document !== 'undefined') initAppShell(document)
