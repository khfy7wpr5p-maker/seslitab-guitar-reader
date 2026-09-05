const JSZip = require('jszip');

const CORPUS_TIMEOUT_MS = 45000;

function setStatus(text) {
  const status = document.getElementById('poc-status');
  if (status) status.textContent = text;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function base64ToBytes(value) {
  const clean = String(value || '').replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('MusicXML ayrıştırılamadı');
  return doc;
}

function firstText(doc, names) {
  for (const name of names) {
    const nodes = doc.getElementsByTagName(name);
    if (nodes.length && String(nodes[0].textContent || '').trim()) return String(nodes[0].textContent).trim();
  }
  return '';
}

function countChildren(node) {
  return node ? Array.from(node.children || []).length : 0;
}

function xmlStats(xmlText) {
  const doc = parseXml(xmlText);
  const notes = Array.from(doc.getElementsByTagName('note'));
  const voices = new Set();
  let maxStaff = 1;
  let articulations = 0;
  notes.forEach((note) => {
    const voice = note.getElementsByTagName('voice')[0];
    if (voice && String(voice.textContent || '').trim()) voices.add(String(voice.textContent).trim());
    const staff = note.getElementsByTagName('staff')[0];
    const staffValue = staff ? Number(String(staff.textContent || '').trim()) : 1;
    if (Number.isFinite(staffValue)) maxStaff = Math.max(maxStaff, staffValue);
    const groups = note.getElementsByTagName('articulations');
    for (const group of groups) articulations += countChildren(group);
  });
  return {
    title: firstText(doc, ['work-title', 'movement-title']),
    parts: doc.getElementsByTagName('part').length,
    measures: doc.getElementsByTagName('measure').length,
    notes: notes.length,
    staves: maxStaff,
    voices: voices.size,
    ties: doc.getElementsByTagName('tie').length,
    slurs: doc.getElementsByTagName('slur').length,
    tuplets: doc.getElementsByTagName('time-modification').length,
    grace: doc.getElementsByTagName('grace').length,
    articulations,
    ornaments: doc.getElementsByTagName('ornaments').length
  };
}

async function extractMxl(bytes, fallbackName) {
  const zip = await JSZip.loadAsync(bytes);
  let rootPath = '';
  const container = zip.file('META-INF/container.xml');
  if (container) {
    const containerText = await container.async('string');
    const doc = parseXml(containerText);
    const rootfiles = doc.getElementsByTagNameNS('*', 'rootfile');
    if (rootfiles.length) rootPath = rootfiles[0].getAttribute('full-path') || '';
  }
  if (!rootPath || !zip.file(rootPath)) {
    rootPath = Object.keys(zip.files).find((name) => !zip.files[name].dir && /\.(xml|musicxml)$/i.test(name) && !/^META-INF\//i.test(name)) || '';
  }
  if (!rootPath || !zip.file(rootPath)) throw new Error(`${fallbackName}: MXL içinde MusicXML bulunamadı`);
  return zip.file(rootPath).async('string');
}

async function readCorpus(file) {
  const lower = String(file.name || '').toLowerCase();
  let bytes;
  if (lower.endsWith('.txt')) bytes = base64ToBytes(await file.text());
  else bytes = new Uint8Array(await file.arrayBuffer());

  const outer = await JSZip.loadAsync(bytes);
  const entries = Object.keys(outer.files)
    .filter((name) => !outer.files[name].dir && /\.(musicxml|xml|mxl)$/i.test(name))
    .sort();
  const scores = [];
  for (const name of entries) {
    const item = outer.file(name);
    if (!item) continue;
    if (/\.mxl$/i.test(name)) {
      const nested = await item.async('uint8array');
      scores.push({ name, xmlText: await extractMxl(nested, name) });
    } else {
      scores.push({ name, xmlText: await item.async('string') });
    }
  }
  if (!scores.length) throw new Error('Corpus içinde MusicXML bulunamadı');
  return scores;
}

function waitForLoadResult(expectedName) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const status = document.getElementById('poc-status');
      const text = status ? String(status.textContent || '') : '';
      if (text.startsWith('Yüklendi:')) return resolve({ ok: true, status: text, ms: performance.now() - started });
      if (text.startsWith('XML hatası:') || text.startsWith('Hata:') || text.startsWith('Başlatma hatası:')) {
        return resolve({ ok: false, status: text, ms: performance.now() - started });
      }
      if (performance.now() - started > CORPUS_TIMEOUT_MS) return reject(new Error(`${expectedName}: render zaman aşımı`));
      setTimeout(tick, 80);
    };
    tick();
  });
}

async function renderThroughEditor(name, xmlText) {
  const input = document.getElementById('mobile-xml-input');
  if (!input) throw new Error('MusicXML girişi bulunamadı');
  if (typeof DataTransfer !== 'function') throw new Error('Bu tarayıcı otomatik corpus dosya geçişini desteklemiyor');

  const fileName = String(name).replace(/^.*\//, '').replace(/\.mxl$/i, '.musicxml');
  const file = new File([xmlText], fileName, { type: 'application/vnd.recordare.musicxml+xml' });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  setStatus(`Corpus render: ${fileName}`);
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return waitForLoadResult(fileName);
}

function formatResult(result) {
  const s = result.stats;
  const mark = result.ok ? '✓' : '✗';
  return `${mark} ${result.label} · ${s.staves} staff · ${s.voices} voice · ${s.measures} ölçü · ${s.notes} nota · ${s.ties} tie · ${s.slurs} slur · ${s.tuplets} tuplet · ${s.grace} grace · ${Math.round(result.renderMs)} ms`;
}

function publishResults(results) {
  window.__smoosicCorpusStressResults = results;
  const panel = document.getElementById('corpus-results-panel');
  const output = document.getElementById('corpus-results');
  if (output) output.textContent = results.map(formatResult).join('\n');
  if (panel) {
    panel.hidden = false;
    panel.open = true;
  }
  const passed = results.filter((item) => item.ok).length;
  const maxVoice = results.reduce((value, item) => Math.max(value, item.stats.voices), 0);
  const totalNotes = results.reduce((value, item) => value + item.stats.notes, 0);
  setStatus(`Corpus render stres testi: ${passed}/${results.length} geçti · max ${maxVoice} voice · ${totalNotes} nota`);
}

async function runCorpusStress(file) {
  const button = document.getElementById('mobile-corpus-test');
  if (button) button.disabled = true;
  const panel = document.getElementById('corpus-results-panel');
  if (panel) panel.hidden = true;
  try {
    setStatus('Corpus açılıyor…');
    const scores = await readCorpus(file);
    const results = [];
    for (let i = 0; i < scores.length; i += 1) {
      const score = scores[i];
      const stats = xmlStats(score.xmlText);
      const label = stats.title || score.name.replace(/^.*\//, '');
      setStatus(`Corpus ${i + 1}/${scores.length}: ${label}`);
      let render;
      try {
        render = await renderThroughEditor(score.name, score.xmlText);
      } catch (error) {
        render = { ok: false, status: String(error), ms: 0 };
      }
      results.push({
        name: score.name,
        label,
        ok: Boolean(render.ok),
        renderMs: Number(render.ms || 0),
        status: render.status,
        stats
      });
      await sleep(180);
    }
    publishResults(results);
  } catch (error) {
    console.error('Corpus stres testi hatası', error);
    setStatus(`Corpus hatası: ${String(error)}`);
  } finally {
    if (button) button.disabled = false;
  }
}

function wireCorpusStress() {
  const button = document.getElementById('mobile-corpus-test');
  const input = document.getElementById('mobile-corpus-input');
  if (!button || !input) return;
  button.addEventListener('click', () => {
    input.value = '';
    input.click();
  });
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (file) runCorpusStress(file);
  });
}

document.addEventListener('DOMContentLoaded', wireCorpusStress);
