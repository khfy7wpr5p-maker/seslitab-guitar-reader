import { listMusicXmlInstrumentParts, readMusicXmlPartInstrumentMap, preparePartInstrumentAssignment, confirmPartInstrumentAssignment } from './services/musicXmlPartInstrumentAssignment.js'

const OPTIONS = [['VIOLIN', 'Keman'], ['GRAND_PIANO', 'Grand Piyano'], ['CLASSICAL_GUITAR', 'Klasik Gitar']]
function message(error) {
  if (/incomplete-assignment|invalid-assignment/.test(error?.message)) return 'Her parti için bir enstrüman seçin.'
  if (/stale-preview/.test(error?.message)) return 'Dosya veya seçim değişti. Yeniden önizleyin.'
  if (/instrument-change|instrument-reference|midi-profile/.test(error?.message)) return 'Dosyadaki enstrüman değişimleri bu atama yolunda desteklenmiyor. Kaynak dosya korundu.'
  return 'Enstrüman ataması hazırlanamadı. Kaynak dosya korundu; yeniden deneyebilirsiniz.'
}

export function mountPartInstrumentAssignmentUi({ root, host, getUpload, prepareUpload, onApply, onRestore, getSettings = () => ({}), isBusy = () => false, onPendingChange = () => {}, onEditingChange = () => {} }) {
  let generation = 0, source = null, applied = null, preview = null, pending = false, editing = false, destroyed = false, settings = null
  let parts = [], selectors = []
  const create = (tag, label = '') => { const node = root.createElement(tag);node.textContent = label;host.appendChild(node);return node }
  const open = create('button', 'Partilere enstrüman ata')
  const rows = create('div'), status = create('p')
  status.setAttribute('role', 'status');status.setAttribute('aria-live', 'polite')
  const inspect = create('button', 'Enstrüman atamasını önizle')
  const apply = create('button', 'Enstrüman atamasını uygula')
  const cancel = create('button', 'Enstrüman atamasını iptal et')
  const undo = create('button', 'Enstrüman atamasını geri al')
  for (const node of [open, inspect, apply, cancel, undo]) node.type = 'button'
  function setPending(value) { if (pending !== value) { pending = value;onPendingChange(value) } }
  function setEditing(value) { if (editing !== value) { editing = value;onEditingChange(value) } }
  function current(token, upload) { return !destroyed && !isBusy() && generation === token && getUpload() === upload }
  function render() {
    host.hidden = parts.length < 2
    rows.hidden = !editing && applied === null
    open.disabled = pending || applied !== null || editing
    inspect.hidden = !editing;inspect.disabled = pending
    apply.hidden = preview === null;apply.disabled = pending
    cancel.hidden = !editing;cancel.disabled = pending
    undo.hidden = applied === null;undo.disabled = pending
    for (const select of selectors) select.disabled = pending || applied !== null
  }
  function reset() {
    generation += 1;source = null;applied = null;preview = null;settings = null
    setPending(false);setEditing(false);rows.replaceChildren();selectors = [];status.textContent = ''
    try { parts = listMusicXmlInstrumentParts(getUpload()?.musicXml) } catch { parts = [] }
    render()
  }
  open.addEventListener('click', () => {
    if (destroyed || pending || editing || applied || isBusy()) return
    source = getUpload();settings = getSettings();generation += 1
    let existing
    try { existing = readMusicXmlPartInstrumentMap(source.musicXml) } catch (error) { status.textContent = message(error);return }
    selectors = parts.map(part => {
      const label = root.createElement('label');label.textContent = `${part.name} (${part.partId})`
      const select = root.createElement('select');select.name = 'partInstrument:' + part.partId
      for (const [value, title] of [['', 'Enstrüman seçin'], ...OPTIONS]) {
        const option = root.createElement('option');option.value = value;option.textContent = title;select.appendChild(option)
      }
      select.value = existing?.[part.partId] ?? ''
      select.addEventListener('change', () => { generation += 1;preview = null;status.textContent = 'Seçim değişti. Yeniden önizleyin.';render() })
      label.appendChild(select);rows.appendChild(label);return select
    })
    setEditing(true);status.textContent = 'Her partinin enstrümanını seçin. Kaynak dosyanız korunur.';render()
  })
  inspect.addEventListener('click', async () => {
    if (!editing || pending || !current(generation, source)) return
    const upload = source, token = ++generation
    const assignments = parts.map((part, i) => ({ partId: part.partId, instrumentId: selectors[i].value }))
    preview = null;setPending(true);status.textContent = 'Enstrüman ataması inceleniyor.';render()
    try {
      const result = await preparePartInstrumentAssignment({ musicXml: upload.musicXml, assignments })
      if (!current(token, upload)) return
      preview = result
      status.textContent = 'Önizleme: ' + assignments.map(row => row.partId + ' → ' + OPTIONS.find(([id]) => id === row.instrumentId)[1]).join('; ') + '. Notalar ve süreler korunur. Uygulamak için onaylayın.'
    } catch (error) { if (current(token, upload)) status.textContent = message(error) }
    finally { if (!destroyed && token === generation) { setPending(false);render() } }
  })
  apply.addEventListener('click', async () => {
    if (!preview || pending || !current(generation, source)) return
    const upload = source, selected = preview, token = generation
    setPending(true);render()
    try {
      const xml = await confirmPartInstrumentAssignment({ musicXml: upload.musicXml, preview: selected, confirmed: true })
      if (!current(token, upload)) return
      const prepared = await prepareUpload(xml)
      if (!current(token, upload)) return
      onApply(prepared, selected.assignments)
      applied = prepared;preview = null;setEditing(false)
      status.textContent = 'Enstrüman ataması uygulandı. Kaynak dosyanız korunuyor.'
    } catch (error) { if (current(token, upload)) status.textContent = message(error) }
    finally { if (!destroyed && token === generation) { setPending(false);render() } }
  })
  cancel.addEventListener('click', () => { if (!pending && !isBusy()) reset() })
  undo.addEventListener('click', () => {
    if (!applied || pending || !current(generation, applied)) return
    onRestore(source, settings);reset()
  })
  reset()
  return Object.freeze({ setUpload: reset, invalidate: reset, isApplied: () => applied !== null,
    destroy() { destroyed = true;generation += 1;setPending(false);setEditing(false);host.replaceChildren() } })
}
