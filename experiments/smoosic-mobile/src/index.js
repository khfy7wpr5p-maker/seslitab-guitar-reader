const { SuiApplication, SuiSampleMedia, SmoScore, XmlToSmo } = require('smoosic');

let applicationInstance = null;

function sendKey(key, options = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ctrlKey: Boolean(options.ctrlKey),
    altKey: Boolean(options.altKey),
    shiftKey: Boolean(options.shiftKey)
  });
  document.body.dispatchEvent(event);
}

function setStatus(text) {
  const status = document.getElementById('poc-status');
  if (status) status.textContent = text;
}

function readFileText(file) {
  if (file && typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Dosya okunamadı'));
    reader.readAsText(file);
  });
}

async function loadMusicXmlFile(file) {
  if (!applicationInstance || !applicationInstance.view) {
    throw new Error('Editör henüz hazır değil');
  }
  if (!file) return;

  const name = String(file.name || 'score.musicxml');
  const lower = name.toLowerCase();
  if (!lower.endsWith('.xml') && !lower.endsWith('.mxml') && !lower.endsWith('.musicxml')) {
    throw new Error('Bu test için .xml, .mxml veya .musicxml seçin');
  }

  setStatus('MusicXML yükleniyor…');
  const text = await readFileText(file);
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'text/xml');
  if (xml.querySelector('parsererror')) {
    throw new Error('MusicXML ayrıştırılamadı');
  }

  const score = XmlToSmo.convert(xml);
  if (score && score.layoutManager && typeof score.layoutManager.zoomToWidth === 'function') {
    score.layoutManager.zoomToWidth(Math.max(320, window.innerWidth));
  }
  await applicationInstance.view.changeScore(score);
  window.dispatchEvent(new Event('resize'));
  setStatus(`Yüklendi: ${name}`);
}

function wireMobileControls() {
  document.querySelectorAll('[data-key]').forEach((button) => {
    button.addEventListener('click', () => {
      sendKey(button.dataset.key, {
        ctrlKey: button.dataset.ctrl === 'true',
        altKey: button.dataset.alt === 'true',
        shiftKey: button.dataset.shift === 'true'
      });
      button.blur();
    });
  });

  const menuButton = document.getElementById('mobile-menu-toggle');
  if (menuButton) {
    menuButton.addEventListener('click', () => {
      document.body.classList.toggle('mobile-menu-open');
    });
  }

  const xmlButton = document.getElementById('mobile-xml-open');
  const xmlInput = document.getElementById('mobile-xml-input');
  if (xmlButton && xmlInput) {
    xmlButton.addEventListener('click', () => {
      xmlInput.value = '';
      xmlInput.click();
    });
    xmlInput.addEventListener('change', async () => {
      try {
        const file = xmlInput.files && xmlInput.files[0];
        await loadMusicXmlFile(file);
      } catch (error) {
        console.error(error);
        setStatus(`XML hatası: ${String(error)}`);
      }
    });
  }

  document.addEventListener('click', (event) => {
    if (window.innerWidth > 820) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.controls-left button')) {
      document.body.classList.remove('mobile-menu-open');
    }
  });
}

async function boot() {
  const domContainer = document.getElementById('smoo');
  wireMobileControls();

  window.addEventListener('error', (event) => {
    setStatus(`Hata: ${event.message || 'bilinmeyen hata'}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    setStatus(`Hata: ${String(event.reason || 'başlatma reddedildi')}`);
  });

  try {
    setStatus('Editör başlatılıyor…');

    // Editing does not require eager soundfont loading. Keep startup light on iOS;
    // playback can be enabled lazily after the editing proof is complete.
    SuiSampleMedia.samplePromise = async (_audio, setProgress) => {
      if (typeof setProgress === 'function') setProgress(100);
    };

    const initialScore = SmoScore.getDefaultScore(SmoScore.defaults, null);
    applicationInstance = await SuiApplication.configure({
      mode: 'application',
      domContainer,
      initialScore
    });

    const rendered = Boolean(applicationInstance && applicationInstance.view && applicationInstance.view.renderer);
    setStatus(rendered ? 'Editör hazır' : 'Renderer oluşmadı');
  } catch (error) {
    console.error(error);
    setStatus(`Başlatma hatası: ${String(error)}`);
  }
}

document.addEventListener('DOMContentLoaded', boot);
