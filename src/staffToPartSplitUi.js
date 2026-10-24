import { prepareStaffToPartSplit, confirmStaffToPartSplit } from './services/musicXmlStaffToPartSplit.js'
import { listMusicXmlInstrumentParts } from './services/musicXmlPartInstrumentAssignment.js'

function failureMessage(error) {
  if (error?.code === 'negative-cursor') return error.measure + '. ölçüde zamanlama tutarsız. Kaynak MusicXML dosyasını düzeltip yeniden seçin.'
  if (String(error?.code).includes('cross-staff') || error?.code === 'polyphonic-violin') return 'Keman melodisi kesin olarak ayrılamadı. Partileri nota düzenleyicide ayırın.'
  return 'Bu dosya güvenle iki partiye ayrılamadı. Kaynak dosya korundu.'
}
export function mountStaffToPartSplitUi({ root, host, getUpload, prepareUpload, onApply, onRestore, isBusy = () => false, onPendingChange = () => {} }) {
  let generation = 0, preview = null, source = null, applied = null, destroyed = false, pending = false
  const create = (tag, label = '') => { const node = root.createElement(tag);node.textContent = label;host.appendChild(node);return node }
  const previewButton = create('button', 'Keman ve piyano partilerini ayır')
  const status = create('p')
  status.setAttribute('role', 'status');status.setAttribute('aria-live', 'polite')
  const apply = create('button', 'Ayırmayı uygula')
  const cancel = create('button', 'Önizlemeyi kapat')
  const undo = create('button', 'Ayırmayı geri al')
  for (const button of [previewButton, apply, cancel, undo]) button.type = 'button'
  function render() {
    host.hidden = typeof getUpload()?.musicXml !== 'string'
    let multipart = false
    try { multipart = listMusicXmlInstrumentParts(getUpload()?.musicXml).length > 1 } catch {}
    previewButton.disabled = pending || applied !== null || multipart
    apply.hidden = preview === null;cancel.hidden = preview === null;undo.hidden = applied === null
    apply.disabled = pending;cancel.disabled = pending;undo.disabled = pending
  }
  function current(token, upload) { return !destroyed && !isBusy() && generation === token && getUpload() === upload }
  function setPending(value) {
    if (pending === value) return
    pending = value
    onPendingChange(value)
  }
  function reset() { generation += 1;preview = null;source = null;applied = null;setPending(false);status.textContent = '';render() }
  previewButton.addEventListener('click', async () => {
    if (destroyed || pending || isBusy() || applied) return
    const upload = getUpload(), token = ++generation
    if (typeof upload?.musicXml !== 'string') return
    setPending(true);preview = null;status.textContent = 'Partiler inceleniyor.';render()
    try {
      const result = await prepareStaffToPartSplit({ musicXml: upload.musicXml })
      if (!current(token, upload)) return
      source = upload;preview = result
      status.textContent = 'Önizleme: ' + result.parts.map(p => p.name + ' (' + p.partId + '), ' + result.measureCount + ' ölçü, ' + p.noteCount + ' nota').join('; ') + '. Kaynak dosyanız korunur.'
    } catch (error) { if (current(token, upload)) status.textContent = failureMessage(error) }
    finally { if (generation === token && !destroyed) { setPending(false);render() } }
  })
  apply.addEventListener('click', async () => {
    if (!preview || pending || !current(generation, source)) return
    const upload = source, token = generation, selected = preview
    setPending(true);render()
    try {
      const xml = await confirmStaffToPartSplit({ musicXml: upload.musicXml, preview: selected, confirmed: true })
      if (!current(token, upload)) return
      const prepared = await prepareUpload(xml)
      if (!current(token, upload)) return
      onApply(prepared)
      applied = prepared;preview = null
      status.textContent = 'Keman ve piyano ayrı partiler olarak hazırlandı. Kaynak dosyanız korunuyor.'
    } catch (error) { if (current(token, upload)) status.textContent = failureMessage(error) }
    finally { if (generation === token && !destroyed) { setPending(false);render() } }
  })
  cancel.addEventListener('click', () => { if (!pending && !isBusy()) reset() })
  undo.addEventListener('click', () => {
    if (applied && !pending && current(generation, applied)) { onRestore(source);reset() }
  })
  render()
  return Object.freeze({ setUpload: reset, invalidate: reset, invalidatePending() { generation += 1;setPending(false);preview = null;if (!applied) source = null;render() }, destroy() { destroyed = true;generation += 1;setPending(false);host.replaceChildren() } })
}
