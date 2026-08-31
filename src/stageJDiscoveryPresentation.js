// Stage J — presentation-only Discovery simplification.
//
// Discovery remains a source-finding surface, not a verification or musical
// authority. This module changes labels, grouping and result-action wording
// only; it never changes search requests, gateway responses, rights evidence,
// intake rules or source URLs.

const observerByRoot = new WeakMap()

export const STAGE_J_DISCOVERY_COPY = Object.freeze({
  title: 'Nota ve kaynak ara',
  intro: 'Eser veya sanatçı adını yazın. Buradaki sonuçlar yalnız kaynak bulmaya yardımcı olur; müzikal doğruluk veya öğretmen onayı anlamına gelmez.',
  queryLabel: 'Eser veya sanatçı',
  help: 'Filtre kullanmak zorunlu değildir. İsterseniz Arama seçeneklerinden sonuçları daraltabilirsiniz.',
  options: 'Arama seçenekleri',
  trust: 'Bulunan kaynaklar doğrulanmış nota değildir. Açtığınız PDF veya MusicXML normal SesliTab doğrulama sürecinden geçmelidir.',
  sourceHeading: 'Başka kaynaklarda ara',
  sourceHelp: 'Bu bağlantılar yalnız ilgili kaynak sitesinde arama açar; eserin veya dosyanın doğrulandığı anlamına gelmez.',
  sourceOpen: 'Kaynak Sitesinde Aç',
})

function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value
}

function findLabel(root, controlId) {
  const labels = root.querySelectorAll?.('label') ?? []
  for (const label of labels) {
    if (label.getAttribute?.('for') === controlId) return label
  }
  return null
}

function ensureAdvancedOptions(root) {
  const form = root.getElementById('discovery-search-form')
  const filters = root.querySelector?.('.discovery-filters') ?? null
  const features = root.querySelector?.('.discovery-feature-group') ?? null
  if (!form || (!filters && !features)) return null

  let details = root.getElementById('stage-j-discovery-options')
  if (!details) {
    details = root.createElement('details')
    details.id = 'stage-j-discovery-options'
    details.className = 'stage-j-discovery-options'

    const summary = root.createElement('summary')
    summary.id = 'stage-j-discovery-options-summary'
    summary.textContent = STAGE_J_DISCOVERY_COPY.options
    details.appendChild(summary)

    const firstAdvanced = filters ?? features
    if (firstAdvanced?.parentElement === form && typeof form.insertBefore === 'function') {
      form.insertBefore(details, firstAdvanced)
    } else {
      form.appendChild(details)
    }
  }

  for (const node of [filters, features]) {
    if (node && node.parentElement !== details) details.appendChild(node)
  }
  return details
}

function ensureTrustNote(root, panel) {
  let note = root.getElementById('stage-j-discovery-trust-note')
  if (note) return note

  note = root.createElement('p')
  note.id = 'stage-j-discovery-trust-note'
  note.className = 'stage-j-discovery-trust-note'
  note.textContent = STAGE_J_DISCOVERY_COPY.trust

  const status = root.getElementById('discovery-status')
  if (status?.parentElement === panel && typeof panel.insertBefore === 'function') {
    panel.insertBefore(note, status)
  } else {
    panel.appendChild(note)
  }
  return note
}

function directResultTitle(link) {
  const card = link?.closest?.('.discovery-result-card') ?? null
  const title = card?.querySelector?.('.discovery-result-title')?.textContent
  return typeof title === 'string' && title.trim() ? title.trim() : null
}

export function simplifyDiscoveryResultActions(root = document) {
  const list = root.getElementById?.('discovery-results')
  const links = list?.querySelectorAll?.('a') ?? []
  let changed = 0
  for (const link of links) {
    const href = typeof link.href === 'string' ? link.href : link.getAttribute?.('href')
    if (typeof href !== 'string' || !href.startsWith('https://')) continue
    const title = directResultTitle(link)
    setText(link, STAGE_J_DISCOVERY_COPY.sourceOpen)
    link.setAttribute?.(
      'aria-label',
      title
        ? `${title} için kaynak sitesini yeni sekmede aç`
        : 'Kaynak sitesini yeni sekmede aç',
    )
    changed += 1
  }
  return changed
}

function applyStaticCopy(root, panel) {
  const intro = panel.querySelector?.('.discovery-intro') ?? null
  setText(intro?.querySelector?.('h3') ?? null, STAGE_J_DISCOVERY_COPY.title)
  setText(intro?.querySelector?.('p') ?? null, STAGE_J_DISCOVERY_COPY.intro)
  setText(findLabel(root, 'discovery-query'), STAGE_J_DISCOVERY_COPY.queryLabel)
  setText(root.getElementById('discovery-help'), STAGE_J_DISCOVERY_COPY.help)

  const sourceSection = root.getElementById('discovery-source-section')
  setText(root.getElementById('discovery-source-heading'), STAGE_J_DISCOVERY_COPY.sourceHeading)
  const sourceHelp = sourceSection?.querySelector?.('.discovery-help') ?? null
  setText(sourceHelp, STAGE_J_DISCOVERY_COPY.sourceHelp)
}

export function applyStageJDiscoveryPresentation(root = document) {
  if (!root || typeof root.getElementById !== 'function') return false
  const panel = root.getElementById('discovery-panel')
  if (!panel) return false

  applyStaticCopy(root, panel)
  ensureAdvancedOptions(root)
  ensureTrustNote(root, panel)
  simplifyDiscoveryResultActions(root)
  panel.setAttribute?.('data-stage-j-presentation', 'ready')
  return true
}

function bindPresentationObserver(root) {
  if (observerByRoot.has(root) || typeof MutationObserver !== 'function') return
  const panel = root.getElementById('discovery-panel')
  if (!panel) return

  let scheduled = false
  const observer = new MutationObserver(() => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      applyStageJDiscoveryPresentation(root)
    })
  })
  observer.observe(panel, { childList: true, subtree: true, characterData: true })
  observerByRoot.set(root, observer)
}

export function initStageJDiscoveryPresentation(root = document) {
  const init = () => {
    if (!applyStageJDiscoveryPresentation(root)) return false
    bindPresentationObserver(root)
    return true
  }

  if (root?.readyState === 'loading') {
    root.addEventListener?.('DOMContentLoaded', init, { once: true })
    return true
  }
  return init()
}
