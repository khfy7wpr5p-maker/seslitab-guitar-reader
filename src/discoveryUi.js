import { searchScores } from './services/discoveryService.js'

const PANEL_ID = 'discovery-panel'
const TAB_ID = 'discovery-tab-btn'
const RESULT_LIMIT = 50

function setAttrs(element, attributes) {
  for (const [name, value] of Object.entries(attributes)) {
    if (value != null) element.setAttribute(name, String(value))
  }
  return element
}

function appendTextElement(root, parent, tagName, text, className = '') {
  const element = root.createElement(tagName)
  if (className) element.className = className
  element.textContent = text
  parent.appendChild(element)
  return element
}

function createSelect(root, id, labelText, options) {
  const wrapper = root.createElement('div')
  wrapper.className = 'discovery-filter'
  const label = root.createElement('label')
  label.setAttribute('for', id)
  label.textContent = labelText
  wrapper.appendChild(label)
  const select = root.createElement('select')
  select.id = id
  select.className = 'discovery-select'
  for (const optionData of options) {
    const option = root.createElement('option')
    option.value = optionData.value
    option.textContent = optionData.label
    if (optionData.selected) option.selected = true
    select.appendChild(option)
  }
  wrapper.appendChild(select)
  return wrapper
}

function createFeatureCheck(root, value, labelText, checked = false) {
  const label = root.createElement('label')
  label.className = 'discovery-check'
  const input = root.createElement('input')
  input.type = 'checkbox'
  input.value = value
  input.dataset.discoveryFeature = value
  input.checked = checked
  label.appendChild(input)
  const text = root.createElement('span')
  text.textContent = labelText
  label.appendChild(text)
  return label
}

export function ensureDiscoveryPanel(root = document) {
  const existing = root.getElementById(PANEL_ID)
  if (existing) return existing

  const tabList = root.querySelector('.input-tabs')
  const tabPanel = root.getElementById('tab-panel')
  if (!tabList || !tabPanel?.parentElement) return null

  const button = root.createElement('button')
  button.id = TAB_ID
  button.type = 'button'
  button.className = 'input-tab-btn'
  button.dataset.tab = 'discovery'
  button.textContent = 'Nota Ara'
  setAttrs(button, {
    role: 'tab',
    'aria-selected': 'false',
    'aria-controls': PANEL_ID,
  })
  tabList.appendChild(button)

  const panel = root.createElement('div')
  panel.id = PANEL_ID
  panel.className = 'input-panel discovery-panel'
  panel.hidden = true
  setAttrs(panel, {
    role: 'tabpanel',
    'aria-labelledby': TAB_ID,
  })

  const intro = root.createElement('div')
  intro.className = 'discovery-intro'
  appendTextElement(root, intro, 'h3', 'Nota ve skor ara')
  appendTextElement(
    root,
    intro,
    'p',
    'Sanatçı, eser veya repertuvar arayın. Akor, söz ve TAB yalnız kaynak açıkça bildiriyorsa gösterilir; notadan akor üretilmez.',
  )
  panel.appendChild(intro)

  const form = root.createElement('form')
  form.id = 'discovery-search-form'
  form.className = 'discovery-form'

  const queryLabel = root.createElement('label')
  queryLabel.setAttribute('for', 'discovery-query')
  queryLabel.textContent = 'Sanatçı veya eser'
  form.appendChild(queryLabel)

  const queryRow = root.createElement('div')
  queryRow.className = 'discovery-query-row'
  const queryInput = root.createElement('input')
  queryInput.id = 'discovery-query'
  queryInput.type = 'search'
  queryInput.required = true
  queryInput.minLength = 2
  queryInput.maxLength = 160
  queryInput.autocomplete = 'off'
  queryInput.placeholder = 'Örn. Barış Manço, Beethoven, string quartet'
  queryInput.setAttribute('aria-describedby', 'discovery-help')
  queryRow.appendChild(queryInput)

  const searchButton = root.createElement('button')
  searchButton.id = 'discovery-search-btn'
  searchButton.type = 'submit'
  searchButton.className = 'btn btn-primary'
  searchButton.textContent = 'Ara'
  queryRow.appendChild(searchButton)
  form.appendChild(queryRow)

  const help = appendTextElement(
    root,
    form,
    'p',
    'Türkçe/yabancı rock-pop ile klasik repertuvar aynı discovery altyapısından aranır.',
    'discovery-help',
  )
  help.id = 'discovery-help'

  const filters = root.createElement('div')
  filters.className = 'discovery-filters'
  filters.appendChild(createSelect(root, 'discovery-repertoire', 'Repertuvar', [
    { value: '', label: 'Tümü' },
    { value: 'contemporary', label: 'Çağdaş / Rock / Pop', selected: true },
    { value: 'classical', label: 'Klasik müzik' },
    { value: 'traditional', label: 'Geleneksel' },
  ]))
  filters.appendChild(createSelect(root, 'discovery-scope', 'Katalog', [
    { value: '', label: 'Türkçe + yabancı' },
    { value: 'turkish', label: 'Türkçe' },
    { value: 'international', label: 'Yabancı / uluslararası' },
  ]))
  filters.appendChild(createSelect(root, 'discovery-format', 'Format', [
    { value: '', label: 'PDF + MusicXML' },
    { value: 'pdf', label: 'PDF' },
    { value: 'musicxml', label: 'MusicXML' },
  ]))
  filters.appendChild(createSelect(root, 'discovery-instrument', 'Enstrüman', [
    { value: '', label: 'Tümü' },
    { value: 'guitar', label: 'Gitar' },
    { value: 'piano', label: 'Piyano' },
    { value: 'violin', label: 'Keman' },
    { value: 'viola', label: 'Viyola' },
    { value: 'cello', label: 'Viyolonsel' },
    { value: 'voice', label: 'Vokal / ses' },
  ]))
  form.appendChild(filters)

  const featureGroup = root.createElement('fieldset')
  featureGroup.className = 'discovery-feature-group'
  const legend = root.createElement('legend')
  legend.textContent = 'Kaynakta bulunması gereken içerik'
  featureGroup.appendChild(legend)
  featureGroup.appendChild(createFeatureCheck(root, 'notation', 'Nota', true))
  featureGroup.appendChild(createFeatureCheck(root, 'chords', 'Akor'))
  featureGroup.appendChild(createFeatureCheck(root, 'lyrics', 'Şarkı sözleri'))
  featureGroup.appendChild(createFeatureCheck(root, 'tablature', 'TAB'))
  form.appendChild(featureGroup)

  panel.appendChild(form)

  const status = root.createElement('div')
  status.id = 'discovery-status'
  status.className = 'discovery-status'
  setAttrs(status, { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' })
  panel.appendChild(status)

  const results = root.createElement('ul')
  results.id = 'discovery-results'
  results.className = 'discovery-results'
  setAttrs(results, { 'aria-label': 'Nota arama sonuçları' })
  panel.appendChild(results)

  tabPanel.parentElement.appendChild(panel)
  return panel
}

export function buildDiscoverySearchRequest(root = document) {
  const query = String(root.getElementById('discovery-query')?.value || '').normalize('NFC').trim()
  if (query.length < 2 || query.length > 160) {
    return { valid: false, error: 'Arama metni 2 ile 160 karakter arasında olmalıdır.' }
  }

  const filters = {}
  const repertoireFamily = root.getElementById('discovery-repertoire')?.value
  const catalogScope = root.getElementById('discovery-scope')?.value
  const format = root.getElementById('discovery-format')?.value
  const instrument = root.getElementById('discovery-instrument')?.value

  if (repertoireFamily) filters.repertoireFamily = repertoireFamily
  if (catalogScope) filters.catalogScope = catalogScope
  if (format) filters.format = format
  if (instrument) filters.requiredInstruments = [instrument]

  const requiredFeatures = root.querySelectorAll('[data-discovery-feature]')
    .filter ? root.querySelectorAll('[data-discovery-feature]').filter((input) => input.checked).map((input) => input.value)
      : Array.from(root.querySelectorAll('[data-discovery-feature]')).filter((input) => input.checked).map((input) => input.value)
  if (requiredFeatures.length) filters.requiredFeatures = requiredFeatures

  return {
    valid: true,
    request: {
      query,
      filters,
      limit: RESULT_LIMIT,
    },
  }
}

function safeSourceUrl(value) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

function featureLabel(feature) {
  return ({ notation: 'Nota', chords: 'Akor', lyrics: 'Söz', tablature: 'TAB' })[feature] || feature
}

function formatLabel(format) {
  return format === 'musicxml' ? 'MusicXML' : String(format || '').toUpperCase()
}

function addResultActions(root, actions, result) {
  const sourceUrl = result.canOpenSource ? safeSourceUrl(result.sourcePageUrl) : null
  if (sourceUrl) {
    const link = root.createElement('a')
    link.className = 'btn btn-primary btn-sm'
    link.href = sourceUrl
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = 'Kaynağı Aç'
    link.setAttribute('aria-label', `${result.title} kaynağını yeni sekmede aç`)
    actions.appendChild(link)
  }

  if (result.format === 'pdf' || result.format === 'musicxml') {
    const intakeButton = root.createElement('button')
    intakeButton.type = 'button'
    intakeButton.className = 'btn btn-secondary btn-sm'
    intakeButton.dataset.discoveryIntake = result.format
    intakeButton.textContent = result.format === 'pdf' ? 'PDF Yüklemeye Geç' : 'MusicXML Yüklemeye Geç'
    intakeButton.addEventListener('click', () => {
      const target = root.getElementById(result.format === 'pdf' ? 'pdf-tab-btn' : 'musicxml-tab-btn')
      target?.click()
      target?.focus?.()
    })
    actions.appendChild(intakeButton)
  }

  if (!sourceUrl && result.handoffMode === 'blocked') {
    const blocked = appendTextElement(root, actions, 'span', 'Bu sonuç içe aktarıma kapalı.', 'discovery-blocked')
    blocked.setAttribute('role', 'status')
  }

  if (result.handoffMode === 'direct-import') {
    const pending = appendTextElement(root, actions, 'span', 'Doğrudan aktarım güvenli dosya-handoff paketi etkinleştirildiğinde açılır.', 'discovery-blocked')
    pending.setAttribute('role', 'status')
  }
}

export function renderDiscoveryResults(root = document, response = {}) {
  const list = root.getElementById('discovery-results')
  const status = root.getElementById('discovery-status')
  if (!list || !status) return 0

  list.textContent = ''
  const results = Array.isArray(response.results) ? response.results : []
  if (results.length === 0) {
    status.textContent = 'Uygun nota/skor sonucu bulunamadı.'
    return 0
  }

  const summaryParts = [`${results.length} sonuç gösteriliyor`]
  if (Number.isInteger(response.totalResults) && response.totalResults > results.length) {
    summaryParts.push(`toplam ${response.totalResults}`)
  }
  if (response.partial) summaryParts.push('bazı kaynaklar yanıt vermedi')
  status.textContent = summaryParts.join(' · ')

  for (const result of results) {
    const item = root.createElement('li')
    item.className = 'discovery-result-card'

    appendTextElement(root, item, 'h4', result.title || 'Başlıksız eser', 'discovery-result-title')
    if (result.artist) appendTextElement(root, item, 'p', result.artist, 'discovery-result-artist')

    const meta = root.createElement('div')
    meta.className = 'discovery-result-meta'
    for (const value of [formatLabel(result.format), result.scoreType, result.source]) {
      if (!value) continue
      appendTextElement(root, meta, 'span', value, 'discovery-badge')
    }
    item.appendChild(meta)

    if (Array.isArray(result.contentFeatures) && result.contentFeatures.length) {
      const features = root.createElement('div')
      features.className = 'discovery-result-features'
      features.setAttribute('aria-label', 'Kaynak içerikleri')
      for (const feature of result.contentFeatures) {
        appendTextElement(root, features, 'span', featureLabel(feature), 'discovery-feature-badge')
      }
      item.appendChild(features)
    }

    const rights = [result.rightsStatus, result.rightsLicense].filter(Boolean).join(' · ')
    if (rights) appendTextElement(root, item, 'p', `Hak durumu: ${rights}`, 'discovery-rights')

    const actions = root.createElement('div')
    actions.className = 'discovery-result-actions'
    addResultActions(root, actions, result)
    item.appendChild(actions)
    list.appendChild(item)
  }

  return results.length
}

export function initDiscoveryUi(root = document, searchFn = searchScores) {
  const panel = ensureDiscoveryPanel(root)
  const button = root.getElementById(TAB_ID)
  if (!panel || !button) return false

  const legacyPanels = ['pdf-panel', 'musicxml-panel', 'tab-panel']
  const setDiscoveryActive = (active) => {
    panel.hidden = !active
    panel.classList?.toggle?.('active', active)
    button.classList?.toggle?.('active', active)
    button.setAttribute('aria-selected', active ? 'true' : 'false')
  }

  button.addEventListener('click', () => {
    root.querySelectorAll('.input-tab-btn').forEach((tabButton) => {
      const active = tabButton === button
      tabButton.classList?.toggle?.('active', active)
      tabButton.setAttribute('aria-selected', active ? 'true' : 'false')
    })
    for (const id of legacyPanels) {
      const legacyPanel = root.getElementById(id)
      if (legacyPanel) {
        legacyPanel.hidden = true
        legacyPanel.classList?.toggle?.('active', false)
      }
    }
    setDiscoveryActive(true)
    root.getElementById('discovery-query')?.focus?.()
  })

  button.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      button.click()
    }
  })

  root.querySelectorAll('.input-tab-btn').forEach((tabButton) => {
    if (tabButton === button) return
    tabButton.addEventListener('click', () => setDiscoveryActive(false))
  })

  const form = root.getElementById('discovery-search-form')
  const status = root.getElementById('discovery-status')
  const searchButton = root.getElementById('discovery-search-btn')
  let activeController = null

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const built = buildDiscoverySearchRequest(root)
    if (!built.valid) {
      status.textContent = built.error
      return
    }

    activeController?.abort()
    activeController = new AbortController()
    searchButton.disabled = true
    status.textContent = 'Nota kaynakları aranıyor…'
    const list = root.getElementById('discovery-results')
    if (list) list.textContent = ''

    const response = await searchFn(built.request, { signal: activeController.signal })
    searchButton.disabled = false
    if (!response?.success) {
      status.textContent = response?.error || 'Nota araması tamamlanamadı.'
      return
    }
    renderDiscoveryResults(root, response)
  })

  return true
}

if (typeof document !== 'undefined') {
  initDiscoveryUi(document)
}
