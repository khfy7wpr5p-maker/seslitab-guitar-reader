const {
  SuiApplication,
  SuiSampleMedia,
  SmoScore,
  XmlToSmo,
  SuiOscillator,
  SuiOscillatorSoundfont
} = require('smoosic');
const { Soundfont } = require('smplr');

let applicationInstance = null;
let activePlaybackInstrument = 'piano';
const mobileSoundfonts = {};
const mobileSoundLoads = {};

const MOBILE_SOUNDS = {
  piano: {
    sampler: 'acoustic_grand_piano',
    label: 'Piyano'
  },
  eGuitar: {
    sampler: 'electric_guitar_jazz',
    label: 'Gitar'
  }
};

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

function installMobilePlaybackBridge() {
  if (!SuiOscillatorSoundfont || !SuiOscillatorSoundfont.prototype) {
    throw new Error('Smoosic soundfont oynatıcısı bulunamadı');
  }
  if (SuiOscillatorSoundfont.prototype.__seslitabMobilePatched) return;

  SuiOscillatorSoundfont.prototype.play = function mobileSoundfontPlay() {
    const sampler = mobileSoundfonts[activePlaybackInstrument];
    if (!sampler || !this.velocity || this.velocity <= 0) return;

    if (SuiOscillator.audio && SuiOscillator.audio.state === 'suspended') {
      SuiOscillator.audio.resume().catch(() => {});
    }

    const currentTime = SuiOscillator.audio.currentTime;
    try {
      sampler.start({
        note: this.midinumber,
        time: currentTime + (this.delayTime || 0),
        duration: this.duration,
        velocity: this.velocity,
        detune: this.detune || 0
      });
    } catch (error) {
      console.error('Mobil soundfont play hatası', error);
    }
  };
  SuiOscillatorSoundfont.prototype.__seslitabMobilePatched = true;
}

async function loadInstrumentSound(instrumentKey) {
  const config = MOBILE_SOUNDS[instrumentKey];
  if (!config) throw new Error('Desteklenmeyen mobil ses');
  if (mobileSoundfonts[instrumentKey]) return mobileSoundfonts[instrumentKey];
  if (mobileSoundLoads[instrumentKey]) return mobileSoundLoads[instrumentKey];

  mobileSoundLoads[instrumentKey] = (async () => {
    setStatus(`${config.label} sesi yükleniyor…`);
    if (SuiOscillator.audio && SuiOscillator.audio.state === 'suspended') {
      await SuiOscillator.audio.resume();
    }

    const sampler = new Soundfont(SuiOscillator.audio, {
      instrument: config.sampler
    });
    await sampler.load;
    mobileSoundfonts[instrumentKey] = sampler;
    setStatus(`${config.label} sesi hazır`);
    return sampler;
  })();

  try {
    return await mobileSoundLoads[instrumentKey];
  } finally {
    delete mobileSoundLoads[instrumentKey];
  }
}

async function selectPlaybackInstrument(instrumentKey) {
  activePlaybackInstrument = instrumentKey;
  await loadInstrumentSound(instrumentKey);
  setStatus(`${MOBILE_SOUNDS[instrumentKey].label} dinleme sesi seçildi`);
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

  const soundButton = document.getElementById('mobile-sound-load');
  if (soundButton) {
    soundButton.addEventListener('click', async () => {
      try {
        await loadInstrumentSound(activePlaybackInstrument);
      } catch (error) {
        console.error(error);
        setStatus(`Ses hatası: ${String(error)}`);
      }
    });
  }

  document.querySelectorAll('[data-instrument]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await selectPlaybackInstrument(button.dataset.instrument);
      } catch (error) {
        console.error(error);
        setStatus(`Enstrüman hatası: ${String(error)}`);
      }
    });
  });

  const playButton = document.getElementById('mobile-play');
  if (playButton) {
    playButton.addEventListener('click', async () => {
      try {
        await loadInstrumentSound(activePlaybackInstrument);
        sendKey(' ');
      } catch (error) {
        console.error(error);
        setStatus(`Playback hatası: ${String(error)}`);
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

    // Never run Smoosic's eager all-instrument loader on iOS. Playback is
    // bridged to one lazily loaded smplr soundfont at a time.
    SuiSampleMedia.samplePromise = async (_audio, setProgress) => {
      if (typeof setProgress === 'function') setProgress(100);
    };
    installMobilePlaybackBridge();

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
