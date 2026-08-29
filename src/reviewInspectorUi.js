import { parseMusicXmlToNotes } from './services/musicEngine.js'
import { prepareMusicXmlQualityGate } from './services/appQualityGate.js'

const PANEL_ID = 'review-inspector-panel'
let lastXml = ''

function getXml(root) {
  const value = root.getElementById('xml-output')?.textContent || ''
  if (!value.trim().startsWith('<?xml') && !value.includes('<score-partwise')) return ''
  return value
}

function ensurePanel(root) {
  let panel = root.getElementById(PANEL_ID)
  if (panel) return panel
  const results = root.getElementById('results-section')
  if (!results) return null
  panel = root.createElement('section')
  panel.id = PANEL_ID
  panel.className = 'review-inspector'
  panel.setAttribute('aria-labelledby', 'review-inspector-title')
  panel.innerHTML = `
    <h3 id="review-inspector-title">İnceleme durumu</h3>
    <p id="review-inspector-summary" role="status" aria-live="polite">Eser analizi bekleniyor.</p>
    <div id="review-inspector-details"></div>
    <button id="review-open-teacher" type="button" class="btn btn-primary">Öğretmen düzenleme ekranını aç</button>
  `
  results.insertBefore(panel, results.firstChild)
  panel.querySelector('#review-open-teacher')?.addEventListener('click', () => {
    const teacher = root.getElementById('teacher-tab-btn')
    if (!teacher) return
    teacher.click()
    teacher.focus?.()
    root.getElementById('tab-teacher')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  })
  return panel
}

function render(root) {
  const results = root.getElementById('results-section')
  if (!results || results.hidden) return
  const xml = getXml(root)
  if (!xml || xml === lastXml) return
  lastXml = xml
  const panel = ensurePanel(root)
  if (!panel) return
  const summary = panel.querySelector('#review-inspector-summary')
  const details = panel.querySelector('#review-inspector-details')
  try {
    const parsed = parseMusicXmlToNotes(xml)
    if (parsed.error || !Array.isArray(parsed.notes) || parsed.notes.length === 0) throw new Error(parsed.error || 'Nota bulunamadı.')
    const report = prepareMusicXmlQualityGate(parsed.notes, xml)
    const state = report.structurallyValid
      ? (report.sourceVerified ? 'Doğrulandı' : 'Yapısal olarak geçerli; öğretmen incelemesi gerekiyor')
      : 'Yapısal sorun bulundu'
    summary.textContent = `${state}. ${parsed.notes.length} nota olayı bulundu.`
    details.innerHTML = `
      <dl class="review-inspector-grid">
        <div><dt>Yapısal kontrol</dt><dd>${report.structurallyValid ? 'Geçti' : 'Geçmedi'}</dd></div>
        <div><dt>Kaynak doğrulaması</dt><dd>${report.sourceVerified ? 'Doğrulandı' : 'Henüz doğrulanmadı'}</dd></div>
        <div><dt>Hata</dt><dd>${report.summary?.errors ?? 0}</dd></div>
        <div><dt>Uyarı</dt><dd>${report.summary?.warnings ?? 0}</dd></div>
      </dl>
      <p class="review-inspector-note">“Doğrulanmadı” OMR'nin başarısız olduğu anlamına gelmez. Otomatik kaynak henüz öğretmen tarafından kontrol edilmiş kesin kaynak sayılmıyor.</p>
    `
  } catch (error) {
    summary.textContent = `İnceleme özeti hazırlanamadı: ${error?.message || 'bilinmeyen hata'}`
    details.textContent = ''
  }
}

export function initReviewInspectorUi(root = document) {
  ensurePanel(root)
  const observer = new MutationObserver(() => render(root))
  const results = root.getElementById('results-section')
  const xml = root.getElementById('xml-output')
  if (results) observer.observe(results, { attributes: true, attributeFilter: ['hidden'] })
  if (xml) observer.observe(xml, { childList: true, characterData: true, subtree: true })
  render(root)
  return true
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => initReviewInspectorUi(document))
}
