const {
  SuiApplication,
  SuiSampleMedia,
  SmoScore,
  XmlToSmo,
  SuiOscillator,
  SuiSampler,
  SuiAudioPlayer
} = require('smoosic');

let applicationInstance = null;
let editorReady = false;
let activePlaybackInstrument = 'piano';
let nativeAudioBridgeInstalled = false;
let nativeStopWrapped = false;
const mobileSoundfonts = {};
const mobileSoundLoads = {};

const MOBILE_SOUNDS = {
  piano: { sampler: 'acoustic_grand_piano', label: 'Piyano' },
  eGuitar: { sampler: 'electric_guitar_jazz', label: 'Gitar' }
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

function setEditorControlsEnabled(enabled) {
  ['mobile-xml-open'].forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.disabled = !enabled;
  });
  document.querySelectorAll('[data-instrument]').forEach((button) => {
    button.disabled = !enabled;
  });
}

function readFileText(file) {
  if (file && typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Dosya okunamadı'));
    reader.readAsText(file);
  });
}

function stopActiveSoundfont() {
  Object.values(mobileSoundfonts).forEach((sampler) => {
    if (sampler && typeof sampler.stop === 'function') {
      try { sampler.stop(); } catch (error) { console.warn('Soundfont stop hatası', error); }
    }
  });
}

function stopNativePlayback() {
  if (applicationInstance && applicationInstance.view && typeof applicationInstance.view.stopPlayer === 'function') {
    applicationInstance.view.stopPlayer();
  } else if (SuiAudioPlayer && typeof SuiAudioPlayer.stopPlayer === 'function') {
    SuiAudioPlayer.stopPlayer();
  }
  stopActiveSoundfont();
}

async function loadMusicXmlFile(file) {
  if (!editorReady || !applicationInstance || !applicationInstance.view) {
    throw new Error('Editör henüz hazır değil');
  }
  if (!file) return;

  stopNativePlayback();
  const name = String(file.name || 'score.musicxml');
  const lower = name.toLowerCase();
  if (!lower.endsWith('.xml') && !lower.endsWith('.mxml') && !lower.endsWith('.musicxml')) {
    throw new Error('Bu test için .xml, .mxml veya .musicxml seçin');
  }

  setStatus('MusicXML yükleniyor…');
  const text = await readFileText(file);
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'text/xml');
  if (xml.querySelector('parsererror')) throw new Error('MusicXML ayrıştırılamadı');

  const score = XmlToSmo.convert(xml);
  if (score && score.layoutManager && typeof score.layoutManager.zoomToWidth === 'function') {
    score.layoutManager.zoomToWidth(Math.max(320, window.innerWidth));
  }
  await applicationInstance.view.changeScore(score);
  window.dispatchEvent(new Event('resize'));
  setStatus(`Yüklendi: ${name}`);
}

async function loadInstrumentSound(instrumentKey) {
  if (!editorReady) throw new Error('Editör henüz hazır değil');
  const config = MOBILE_SOUNDS[instrumentKey];
  if (!config) throw new Error('Desteklenmeyen mobil ses');
  if (mobileSoundfonts[instrumentKey]) return mobileSoundfonts[instrumentKey];
  if (mobileSoundLoads[instrumentKey]) return mobileSoundLoads[instrumentKey];

  mobileSoundLoads[instrumentKey] = (async () => {
    setStatus(`${config.label} sesi yükleniyor…`);
    if (SuiOscillator.audio && SuiOscillator.audio.state === 'suspended') {
      await SuiOscillator.audio.resume();
    }
    const smplr = await import('smplr');
    const Soundfont = smplr.Soundfont;
    if (!Soundfont) throw new Error('Soundfont modülü yüklenemedi');
    const sampler = new Soundfont(SuiOscillator.audio, { instrument: config.sampler });
    if (sampler.load) await sampler.load;
    else if (sampler.ready) await sampler.ready;
    mobileSoundfonts[instrumentKey] = sampler;
    setStatus(`${config.label} sesi hazır · Smoosic ▶ kullanın`);
    return sampler;
  })();

  try {
    return await mobileSoundLoads[instrumentKey];
  } finally {
    delete mobileSoundLoads[instrumentKey];
  }
}

async function selectPlaybackInstrument(instrumentKey) {
  stopNativePlayback();
  activePlaybackInstrument = instrumentKey;
  await loadInstrumentSound(instrumentKey);
  setStatus(`${MOBILE_SOUNDS[instrumentKey].label} seçildi · Smoosic ▶ kullanın`);
}

function installNativeAudioBridge() {
  if (nativeAudioBridgeInstalled) return true;
  if (!SuiSampler || !SuiSampler.prototype || typeof SuiSampler.prototype.play !== 'function') {
    return false;
  }

  SuiSampler.prototype.play = function mobileNativeSamplerPlay() {
    const sampler = mobileSoundfonts[activePlaybackInstrument];
    const velocity = Number(this.velocity || 0);
    const note = Number(this.midinumber || 0);
    if (!sampler || velocity <= 0 || note <= 0) return;

    if (SuiOscillator.audio && SuiOscillator.audio.state === 'suspended') {
      SuiOscillator.audio.resume().catch(() => {});
    }

    const delay = Math.max(0, Number(this.delayTime || 0));
    const duration = Math.max(0.035, Number(this.duration || 0.2));
    const detune = Number(this.detune || 0);
    const currentTime = SuiOscillator.audio.currentTime;

    try {
      sampler.start({
        note,
        time: currentTime + delay,
        duration,
        velocity: Math.max(1, Math.min(127, Math.round(velocity))),
        detune
      });
    } catch (error) {
      console.error('Native mobil sampler hatası', error);
    }
  };

  nativeAudioBridgeInstalled = true;
  return true;
}

function wrapNativeStop() {
  if (nativeStopWrapped || !SuiAudioPlayer || typeof SuiAudioPlayer.stopPlayer !== 'function') return;
  const originalStopPlayer = SuiAudioPlayer.stopPlayer.bind(SuiAudioPlayer);
  SuiAudioPlayer.stopPlayer = function mobileAwareStopPlayer() {
    const result = originalStopPlayer();
    stopActiveSoundfont();
    return result;
  };
  nativeStopWrapped = true;
}

function wireNativeTransportGuard() {
  document.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const playButton = target.closest('#playButton2');
    if (!playButton || !editorReady) return;

    if (mobileSoundfonts[activePlaybackInstrument]) {
      setStatus(`Oynatılıyor: ${MOBILE_SOUNDS[activePlaybackInstrument].label}`);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    try {
      await loadInstrumentSound(activePlaybackInstrument);
      setStatus(`Oynatılıyor: ${MOBILE_SOUNDS[activePlaybackInstrument].label}`);
      await applicationInstance.view.playFromSelection();
    } catch (error) {
      console.error(error);
      setStatus(`Playback hatası: ${String(error)}`);
    }
  }, true);

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('#stopButton2')) {
      stopActiveSoundfont();
      setStatus('Playback durdu');
    }
  });
}

function wireMobileControls() {
  document.querySelectorAll('[data-key]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!editorReady) return setStatus('Editör hazırlanıyor…');
      sendKey(button.dataset.key, {
        ctrlKey: button.dataset.ctrl === 'true',
        altKey: button.dataset.alt === 'true',
        shiftKey: button.dataset.shift === 'true'
      });
      button.blur();
    });
  });

  const menuButton = document.getElementById('mobile-menu-toggle');
  if (menuButton) menuButton.addEventListener('click', () => document.body.classList.toggle('mobile-menu-open'));

  const xmlButton = document.getElementById('mobile-xml-open');
  const xmlInput = document.getElementById('mobile-xml-input');
  if (xmlButton && xmlInput) {
    xmlButton.addEventListener('click', () => {
      if (!editorReady) return setStatus('Editör hazırlanıyor…');
      xmlInput.value = '';
      xmlInput.click();
    });
    xmlInput.addEventListener('change', async () => {
      try { await loadMusicXmlFile(xmlInput.files && xmlInput.files[0]); }
      catch (error) { console.error(error); setStatus(`XML hatası: ${String(error)}`); }
    });
  }

  document.querySelectorAll('[data-instrument]').forEach((button) => {
    button.addEventListener('click', async () => {
      try { await selectPlaybackInstrument(button.dataset.instrument); }
      catch (error) { console.error(error); setStatus(`Enstrüman hatası: ${String(error)}`); }
    });
  });

  document.addEventListener('click', (event) => {
    if (window.innerWidth > 820) return;
    const target = event.target;
    if (target instanceof Element && target.closest('.controls-left button')) {
      document.body.classList.remove('mobile-menu-open');
    }
  });
}

async function boot() {
  const domContainer = document.getElementById('smoo');
  wireMobileControls();
  wireNativeTransportGuard();
  setEditorControlsEnabled(false);
  window.addEventListener('error', (event) => setStatus(`Hata: ${event.message || 'bilinmeyen hata'}`));
  window.addEventListener('unhandledrejection', (event) => setStatus(`Hata: ${String(event.reason || 'başlatma reddedildi')}`));

  try {
    setStatus('Editör başlatılıyor…');

    // Keep Smoosic's scheduler/cursor, but do not preload its full soundfont bank on iPhone.
    SuiSampleMedia.samplePromise = async (_audio, setProgress) => {
      if (typeof setProgress === 'function') setProgress(100);
    };

    const bridgeReady = installNativeAudioBridge();
    wrapNativeStop();

    const initialScore = SmoScore.getDefaultScore(SmoScore.defaults, null);
    applicationInstance = await SuiApplication.configure({ mode: 'application', domContainer, initialScore });
    const rendered = Boolean(applicationInstance && applicationInstance.view && applicationInstance.view.renderer);
    editorReady = rendered;
    setEditorControlsEnabled(rendered);

    if (!rendered) setStatus('Renderer oluşmadı');
    else if (!bridgeReady) setStatus('Editör hazır · native ses köprüsü bulunamadı');
    else setStatus('Editör hazır · Piyano/Gitar seçin, Smoosic ▶ kullanın');
  } catch (error) {
    console.error(error);
    editorReady = false;
    setEditorControlsEnabled(false);
    setStatus(`Başlatma hatası: ${String(error)}`);
  }
}

document.addEventListener('DOMContentLoaded', boot);
