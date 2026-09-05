const {
  SuiApplication,
  SuiSampleMedia,
  SmoScore,
  XmlToSmo,
  SuiOscillator,
  SmoMusic
} = require('smoosic');

let applicationInstance = null;
let editorReady = false;
let activePlaybackInstrument = 'piano';
let mobilePlaying = false;
let playbackEndTimer = null;
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
  ['mobile-xml-open', 'mobile-sound-load', 'mobile-play'].forEach((id) => {
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

function stopMobilePlayback() {
  const sampler = mobileSoundfonts[activePlaybackInstrument];
  if (sampler && typeof sampler.stop === 'function') {
    try { sampler.stop(); } catch (error) { console.warn(error); }
  }
  if (playbackEndTimer) {
    clearTimeout(playbackEndTimer);
    playbackEndTimer = null;
  }
  mobilePlaying = false;
  setStatus('Playback durdu');
}

async function loadMusicXmlFile(file) {
  if (!editorReady || !applicationInstance || !applicationInstance.view) {
    throw new Error('Editör henüz hazır değil');
  }
  if (!file) return;

  stopMobilePlayback();
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
  if (mobilePlaying) stopMobilePlayback();
  activePlaybackInstrument = instrumentKey;
  await loadInstrumentSound(instrumentKey);
  setStatus(`${MOBILE_SOUNDS[instrumentKey].label} dinleme sesi seçildi`);
}

function pitchToMidi(measure, note, pitch, pitchIx) {
  try {
    const microtone = typeof note.getMicrotone === 'function' ? note.getMicrotone(pitchIx) : undefined;
    const result = SmoMusic.midiNumberAndDetuneFromPitch(
      pitch,
      -1 * Number(measure.transposeIndex || 0),
      microtone
    );
    return { note: result.midinumber, detune: result.detune || 0 };
  } catch (error) {
    console.warn('Pitch dönüştürülemedi', error);
    return null;
  }
}

function collectPlaybackEvents(score) {
  const events = [];
  let scoreTime = 0;
  const staffCount = Array.isArray(score.staves) ? score.staves.length : 0;
  const measureCount = staffCount ? Math.max(...score.staves.map((s) => s.measures.length)) : 0;

  for (let measureIx = 0; measureIx < measureCount; measureIx += 1) {
    const referenceMeasure = score.staves[0] && score.staves[0].measures[measureIx];
    if (!referenceMeasure) continue;
    const tempo = typeof referenceMeasure.getTempo === 'function' ? referenceMeasure.getTempo() : null;
    const bpm = Math.max(20, Number((tempo && tempo.bpm) || 120));
    const beatDuration = Math.max(1, Number((tempo && tempo.beatDuration) || 4096));
    const secondsPerTick = 60 / (bpm * beatDuration);
    let measureTicks = 0;

    score.staves.forEach((staff) => {
      const measure = staff.measures[measureIx];
      if (!measure || !Array.isArray(measure.voices)) return;
      measure.voices.forEach((voice) => {
        let tick = 0;
        const notes = voice && Array.isArray(voice.notes) ? voice.notes : [];
        notes.forEach((note) => {
          const tickCount = Math.max(0, Number(note.tickCount || 0));
          if (note.noteType === 'n' && Array.isArray(note.pitches)) {
            const duration = Math.max(0.04, tickCount * secondsPerTick * 0.92);
            note.pitches.forEach((pitch, pitchIx) => {
              const midi = pitchToMidi(measure, note, pitch, pitchIx);
              if (midi) {
                events.push({
                  at: scoreTime + tick * secondsPerTick,
                  duration,
                  note: midi.note,
                  detune: midi.detune
                });
              }
            });
          }
          tick += tickCount;
        });
        measureTicks = Math.max(measureTicks, tick);
      });
    });

    if (!measureTicks && typeof referenceMeasure.getMaxTicksVoice === 'function') {
      measureTicks = Number(referenceMeasure.getMaxTicksVoice() || 0);
    }
    scoreTime += Math.max(0, measureTicks * secondsPerTick);
  }

  if (events.length > 6000) throw new Error('Bu test için skor çok büyük');
  return { events, duration: scoreTime };
}

async function toggleMobilePlayback() {
  if (!editorReady || !applicationInstance || !applicationInstance.view) {
    throw new Error('Editör henüz hazır değil');
  }
  if (mobilePlaying) {
    stopMobilePlayback();
    return;
  }

  const sampler = await loadInstrumentSound(activePlaybackInstrument);
  if (SuiOscillator.audio && SuiOscillator.audio.state === 'suspended') {
    await SuiOscillator.audio.resume();
  }
  const score = applicationInstance.view.score;
  const { events, duration } = collectPlaybackEvents(score);
  if (!events.length) throw new Error('Çalınacak nota bulunamadı');

  const startAt = SuiOscillator.audio.currentTime + 0.08;
  events.forEach((event) => {
    sampler.start({
      note: event.note,
      time: startAt + event.at,
      duration: event.duration,
      velocity: 88,
      detune: event.detune
    });
  });
  mobilePlaying = true;
  setStatus(`Oynatılıyor: ${MOBILE_SOUNDS[activePlaybackInstrument].label}`);
  playbackEndTimer = setTimeout(() => {
    mobilePlaying = false;
    playbackEndTimer = null;
    setStatus('Playback tamamlandı');
  }, Math.max(100, Math.ceil((duration + 0.25) * 1000)));
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

  const soundButton = document.getElementById('mobile-sound-load');
  if (soundButton) soundButton.addEventListener('click', async () => {
    try { await loadInstrumentSound(activePlaybackInstrument); }
    catch (error) { console.error(error); setStatus(`Ses hatası: ${String(error)}`); }
  });

  document.querySelectorAll('[data-instrument]').forEach((button) => {
    button.addEventListener('click', async () => {
      try { await selectPlaybackInstrument(button.dataset.instrument); }
      catch (error) { console.error(error); setStatus(`Enstrüman hatası: ${String(error)}`); }
    });
  });

  const playButton = document.getElementById('mobile-play');
  if (playButton) playButton.addEventListener('click', async () => {
    try { await toggleMobilePlayback(); }
    catch (error) { console.error(error); setStatus(`Playback hatası: ${String(error)}`); }
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
  setEditorControlsEnabled(false);
  window.addEventListener('error', (event) => setStatus(`Hata: ${event.message || 'bilinmeyen hata'}`));
  window.addEventListener('unhandledrejection', (event) => setStatus(`Hata: ${String(event.reason || 'başlatma reddedildi')}`));

  try {
    setStatus('Editör başlatılıyor…');
    SuiSampleMedia.samplePromise = async (_audio, setProgress) => {
      if (typeof setProgress === 'function') setProgress(100);
    };
    const initialScore = SmoScore.getDefaultScore(SmoScore.defaults, null);
    applicationInstance = await SuiApplication.configure({ mode: 'application', domContainer, initialScore });
    const rendered = Boolean(applicationInstance && applicationInstance.view && applicationInstance.view.renderer);
    editorReady = rendered;
    setEditorControlsEnabled(rendered);
    setStatus(rendered ? 'Editör hazır' : 'Renderer oluşmadı');
  } catch (error) {
    console.error(error);
    editorReady = false;
    setEditorControlsEnabled(false);
    setStatus(`Başlatma hatası: ${String(error)}`);
  }
}

document.addEventListener('DOMContentLoaded', boot);
