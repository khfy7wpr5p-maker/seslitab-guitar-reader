const {
  SuiApplication,
  SuiSampleMedia,
  SmoScore,
  XmlToSmo,
  SmoToXml,
  SuiOscillator,
  SuiSampler,
  SuiAudioPlayer,
  SmoMusic,
  ScoreRoadMapBuilder
} = require('smoosic');

let applicationInstance = null;
let editorReady = false;
let activePlaybackInstrument = 'piano';
let nativeAudioBridgeInstalled = false;
let nativeStopWrapped = false;
let nativePlayWrapped = false;
let nativeAnimationWrapped = false;
let nativeCueWrapped = false;
let selectionPreviewBridgeInstalled = false;
let selectionPreviewToken = 0;
let metronomeEnabled = false;
let metronomeAwaitingStart = false;
let metronomeTimer = null;
let metronomeRunToken = 0;
let metronomeNodes = [];
let activePlaybackStartPoint = null;
let currentScoreBaseName = 'score';
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
  ['mobile-xml-open', 'mobile-xml-export', 'mobile-metronome'].forEach((id) => {
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

function stripMusicXmlExtension(name) {
  return String(name || 'score')
    .replace(/\.(musicxml|mxml|xml)$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-') || 'score';
}

function stopActiveSoundfont() {
  Object.values(mobileSoundfonts).forEach((sampler) => {
    if (sampler && typeof sampler.stop === 'function') {
      try { sampler.stop(); } catch (error) { console.warn('Soundfont stop hatası', error); }
    }
  });
}

function clearMetronomeNodes() {
  const nodes = metronomeNodes;
  metronomeNodes = [];
  nodes.forEach(({ osc, gain }) => {
    try { osc.stop(); } catch (error) {}
    try { osc.disconnect(); } catch (error) {}
    try { gain.disconnect(); } catch (error) {}
  });
}

function stopMetronomeTimeline() {
  metronomeRunToken += 1;
  metronomeAwaitingStart = false;
  if (metronomeTimer) {
    clearTimeout(metronomeTimer);
    metronomeTimer = null;
  }
  clearMetronomeNodes();
}

function stopNativePlayback() {
  stopMetronomeTimeline();
  selectionPreviewToken += 1;
  activePlaybackStartPoint = null;
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
  currentScoreBaseName = stripMusicXmlExtension(name);
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

async function playSelectionPreviewWithPiano(selection, score, token) {
  if (!selection || !selection.note || !selection.measure) return;
  if (SuiAudioPlayer && SuiAudioPlayer.playing) return;

  const note = selection.note;
  if ((typeof note.isRest === 'function' && note.isRest())
      || (typeof note.isSlash === 'function' && note.isSlash())
      || (typeof note.isHidden === 'function' && note.isHidden())) {
    return;
  }
  if (!Array.isArray(note.pitches) || !note.pitches.length) return;

  const sampler = await loadInstrumentSound('piano');
  if (token !== selectionPreviewToken || (SuiAudioPlayer && SuiAudioPlayer.playing)) return;
  if (!sampler || !SuiOscillator.audio) return;

  if (SuiOscillator.audio.state === 'suspended') {
    await SuiOscillator.audio.resume();
  }
  if (token !== selectionPreviewToken) return;

  try {
    if (typeof sampler.stop === 'function') sampler.stop();
  } catch (error) {
    console.warn('Piyano ön dinleme stop hatası', error);
  }

  const selectedPitchIndexes = selection.selector
    && Array.isArray(selection.selector.pitches)
    && selection.selector.pitches.length
    ? selection.selector.pitches
    : note.pitches.map((_pitch, index) => index);
  const transpose = -1 * Number(selection.measure.transposeIndex || 0);
  const startTime = SuiOscillator.audio.currentTime + 0.01;

  selectedPitchIndexes.forEach((pitchIndex) => {
    const pitch = note.pitches[pitchIndex];
    if (!pitch || !SmoMusic || typeof SmoMusic.midiNumberAndDetuneFromPitch !== 'function') return;
    const microtone = typeof note.getMicrotone === 'function' ? note.getMicrotone(pitchIndex) : undefined;
    const midi = SmoMusic.midiNumberAndDetuneFromPitch(pitch, transpose, microtone);
    if (!midi || !Number.isFinite(Number(midi.midinumber))) return;
    try {
      sampler.start({
        note: Number(midi.midinumber),
        time: startTime,
        duration: 0.34,
        velocity: 92,
        detune: Number(midi.detune || 0)
      });
    } catch (error) {
      console.warn('Piyano nota ön dinleme hatası', error);
    }
  });
}

function installSelectionPreviewBridge() {
  if (selectionPreviewBridgeInstalled) return true;
  if (!SuiOscillator || typeof SuiOscillator.playSelectionNow !== 'function') return false;

  SuiOscillator.playSelectionNow = function mobilePianoSelectionPreview(selection, score) {
    if (!editorReady || (SuiAudioPlayer && SuiAudioPlayer.playing)) return;
    const token = ++selectionPreviewToken;
    playSelectionPreviewWithPiano(selection, score, token).catch((error) => {
      console.warn('Piyano seçim ön dinleme hatası', error);
    });
  };

  selectionPreviewBridgeInstalled = true;
  return true;
}

function getSelectedStartPoint() {
  const view = applicationInstance && applicationInstance.view;
  if (!view || !view.tracker || !view.score) {
    return { staff: 0, measure: 0, voice: 0, noteIndex: 0, tickOffset: 0 };
  }

  try {
    const selection = typeof view.tracker.getExtremeSelection === 'function'
      ? view.tracker.getExtremeSelection(-1)
      : (view.tracker.selections && view.tracker.selections[0]);
    const selector = selection && selection.selector ? selection.selector : {};
    const staff = Math.max(0, Number(selector.staff || 0));
    const measure = Math.max(0, Number(selector.measure || 0));
    const voice = Math.max(0, Number(selector.voice || 0));
    const noteIndex = Math.max(0, Number(selector.tick || 0));
    const scoreMeasure = view.score.staves[staff] && view.score.staves[staff].measures[measure];
    const notes = scoreMeasure && scoreMeasure.voices[voice] && Array.isArray(scoreMeasure.voices[voice].notes)
      ? scoreMeasure.voices[voice].notes
      : [];
    let tickOffset = 0;
    for (let i = 0; i < Math.min(noteIndex, notes.length); i += 1) {
      tickOffset += Math.max(0, Number(notes[i].tickCount || 0));
    }
    return { staff, measure, voice, noteIndex, tickOffset };
  } catch (error) {
    console.warn('Playback başlangıç noktası okunamadı', error);
    return { staff: 0, measure: 0, voice: 0, noteIndex: 0, tickOffset: 0 };
  }
}

function getSelectedStartMeasure() {
  return getSelectedStartPoint().measure;
}

function installExactStartBridge() {
  if (nativeCueWrapped) return true;
  if (!SuiAudioPlayer || !SuiAudioPlayer.prototype || typeof SuiAudioPlayer.prototype.createCuedSound !== 'function') {
    return false;
  }

  const originalCreateCuedSound = SuiAudioPlayer.prototype.createCuedSound;
  SuiAudioPlayer.prototype.createCuedSound = function mobileExactStartCreateCuedSound(measureIndex, ...args) {
    const start = activePlaybackStartPoint;
    const node = this.cuedSounds && this.cuedSounds.paramLinkHead;
    if (start && !start.applied && node && Number(node.measureIndex) === Number(start.measure)) {
      if (start.tickOffset > 0 && node.soundParams) {
        const trimmed = {};
        Object.keys(node.soundParams).forEach((key) => {
          if (Number(key) >= start.tickOffset) trimmed[key] = node.soundParams[key];
        });
        node.soundParams = trimmed;
      }
      start.applied = true;
    }
    return originalCreateCuedSound.call(this, measureIndex, ...args);
  };

  nativeCueWrapped = true;
  return true;
}

function getMeasureTicks(measure) {
  if (!measure) return 0;
  if (typeof measure.getMaxTicksVoice === 'function') {
    const value = Number(measure.getMaxTicksVoice() || 0);
    if (value > 0) return value;
  }
  let maxTicks = 0;
  const voices = Array.isArray(measure.voices) ? measure.voices : [];
  voices.forEach((voice) => {
    const notes = voice && Array.isArray(voice.notes) ? voice.notes : [];
    const ticks = notes.reduce((sum, note) => sum + Math.max(0, Number(note.tickCount || 0)), 0);
    maxTicks = Math.max(maxTicks, ticks);
  });
  return maxTicks;
}

function buildMetronomeEvents(score, startMeasure, startTickOffset = 0) {
  if (!score || !Array.isArray(score.staves) || !score.staves.length) return [];
  const events = [];
  const roadMap = new ScoreRoadMapBuilder(score);
  roadMap.populate(startMeasure);
  let elapsedSeconds = 0;
  let guard = 0;
  let firstMeasurePending = true;

  while (!roadMap.isDone && guard < 20000) {
    const measureIx = roadMap.getAndAdvance();
    guard += 1;
    if (!Number.isFinite(Number(measureIx)) || measureIx < 0) continue;
    const measure = score.staves[0] && score.staves[0].measures[measureIx];
    if (!measure) continue;

    const tempo = typeof measure.getTempo === 'function' ? measure.getTempo() : null;
    const bpm = Math.max(20, Number((tempo && tempo.bpm) || 120));
    const tempoBeatTicks = Math.max(1, Number((tempo && tempo.beatDuration) || 4096));
    const secondsPerTick = 60 / (bpm * tempoBeatTicks);
    const measureTicks = getMeasureTicks(measure);
    const localStartTick = firstMeasurePending && measureIx === startMeasure
      ? Math.max(0, Math.min(measureTicks, Number(startTickOffset || 0)))
      : 0;

    const clickTicks = tempoBeatTicks;
    const firstClickTick = localStartTick > 0
      ? Math.ceil(localStartTick / clickTicks) * clickTicks
      : 0;
    for (let tick = firstClickTick; tick < measureTicks - 0.5; tick += clickTicks) {
      events.push({
        at: elapsedSeconds + ((tick - localStartTick) * secondsPerTick),
        accent: localStartTick === 0 && tick === 0,
        bpm,
        beatDuration: tempoBeatTicks,
        measure: measureIx
      });
      if (events.length > 12000) throw new Error('Metronom için skor çok uzun');
    }
    elapsedSeconds += Math.max(0, measureTicks - localStartTick) * secondsPerTick;
    if (firstMeasurePending && measureIx === startMeasure) firstMeasurePending = false;
  }

  return events;
}

function scheduleMetronomeClick(accent, when) {
  const audio = SuiOscillator && SuiOscillator.audio;
  if (!audio) return;
  try {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const start = Math.max(audio.currentTime, Number(when) || audio.currentTime);
    osc.frequency.value = accent ? 1700 : 1150;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.16 : 0.09, start + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.045);
    osc.connect(gain);
    gain.connect(audio.destination);
    const entry = { osc, gain };
    metronomeNodes.push(entry);
    osc.onended = () => {
      metronomeNodes = metronomeNodes.filter((item) => item !== entry);
      try { osc.disconnect(); } catch (error) {}
      try { gain.disconnect(); } catch (error) {}
    };
    osc.start(start);
    osc.stop(start + 0.05);
  } catch (error) {
    console.warn('Metronom click hatası', error);
  }
}

function startMetronomeTimeline(startMeasure, startTickOffset = 0) {
  stopMetronomeTimeline();
  if (!metronomeEnabled || !applicationInstance || !applicationInstance.view) return;

  const audio = SuiOscillator && SuiOscillator.audio;
  if (!audio) return;
  if (audio.state === 'suspended') audio.resume().catch(() => {});

  let events = [];
  try {
    events = buildMetronomeEvents(applicationInstance.view.score, startMeasure, startTickOffset);
  } catch (error) {
    console.error(error);
    setStatus(`Metronom hatası: ${String(error)}`);
    return;
  }
  if (!events.length) return;

  const token = ++metronomeRunToken;
  const origin = audio.currentTime;
  let index = 0;

  const fillAudioQueue = () => {
    if (token !== metronomeRunToken) return;
    const horizon = audio.currentTime + 5.0;
    while (index < events.length) {
      const event = events[index];
      const when = origin + event.at;
      if (when > horizon) break;
      scheduleMetronomeClick(event.accent, when);
      index += 1;
    }
    if (index < events.length) {
      metronomeTimer = setTimeout(fillAudioQueue, 1800);
    }
  };

  fillAudioQueue();
  const first = events[0];
  setStatus(`Metronom kilitli: ${Math.round(first.bpm)} BPM · Smoosic tempo`);
}

function wrapNativePlay() {
  if (nativePlayWrapped || !applicationInstance || !applicationInstance.view) return;
  const view = applicationInstance.view;
  if (typeof view.playFromSelection !== 'function') return;
  const originalPlay = view.playFromSelection.bind(view);
  view.playFromSelection = async function mobileAwarePlayFromSelection(...args) {
    stopMetronomeTimeline();
    selectionPreviewToken += 1;
    const start = getSelectedStartPoint();
    activePlaybackStartPoint = { ...start, applied: false };
    metronomeAwaitingStart = metronomeEnabled;
    setStatus(`Oynatılıyor: ${MOBILE_SOUNDS[activePlaybackInstrument].label} · ölçü ${start.measure + 1} · nota ${start.noteIndex + 1}`);
    return originalPlay(...args);
  };
  nativePlayWrapped = true;
}

function wrapNativeAudioAnimation() {
  if (nativeAnimationWrapped || !applicationInstance || !applicationInstance.view) return;
  const audioAnimation = applicationInstance.view.audioAnimation;
  if (!audioAnimation || typeof audioAnimation.audioAnimationHandler !== 'function') return;

  const originalAnimation = audioAnimation.audioAnimationHandler;
  audioAnimation.audioAnimationHandler = function mobileAwareAudioAnimation(view, selector, offsetPct, durationPct) {
    if (metronomeAwaitingStart && metronomeEnabled) {
      metronomeAwaitingStart = false;
      const start = activePlaybackStartPoint || getSelectedStartPoint();
      const startMeasure = selector && Number.isFinite(Number(selector.measure))
        ? Number(selector.measure)
        : start.measure;
      const tickOffset = startMeasure === start.measure ? start.tickOffset : 0;
      startMetronomeTimeline(startMeasure, tickOffset);
    }
    return originalAnimation(view, selector, offsetPct, durationPct);
  };

  if (typeof audioAnimation.clearAudioAnimationHandler === 'function') {
    const originalClear = audioAnimation.clearAudioAnimationHandler;
    audioAnimation.clearAudioAnimationHandler = function mobileAwareClearAnimation(delay) {
      if (!delay || delay < 1) stopMetronomeTimeline();
      return originalClear(delay);
    };
  }
  nativeAnimationWrapped = true;
}

function wrapNativeStop() {
  if (nativeStopWrapped || !SuiAudioPlayer || typeof SuiAudioPlayer.stopPlayer !== 'function') return;
  const originalStopPlayer = SuiAudioPlayer.stopPlayer.bind(SuiAudioPlayer);
  SuiAudioPlayer.stopPlayer = function mobileAwareStopPlayer() {
    stopMetronomeTimeline();
    selectionPreviewToken += 1;
    activePlaybackStartPoint = null;
    const result = originalStopPlayer();
    stopActiveSoundfont();
    return result;
  };
  nativeStopWrapped = true;
}

function updateMetronomeButton() {
  const button = document.getElementById('mobile-metronome');
  if (!button) return;
  button.setAttribute('aria-pressed', metronomeEnabled ? 'true' : 'false');
  button.textContent = metronomeEnabled ? 'Metronom ✓' : 'Metronom';
}

function toggleMetronome() {
  metronomeEnabled = !metronomeEnabled;
  updateMetronomeButton();
  if (!metronomeEnabled) stopMetronomeTimeline();
  const suffix = SuiAudioPlayer && SuiAudioPlayer.playing ? ' · sonraki Play' : '';
  setStatus(`Metronom ${metronomeEnabled ? 'açık' : 'kapalı'}${suffix}`);
}

function scoreShape(score) {
  const staves = Array.isArray(score && score.staves) ? score.staves : [];
  let measures = 0;
  let voices = 0;
  let notes = 0;
  staves.forEach((staff) => {
    const staffMeasures = Array.isArray(staff.measures) ? staff.measures : [];
    measures += staffMeasures.length;
    staffMeasures.forEach((measure) => {
      const measureVoices = Array.isArray(measure.voices) ? measure.voices : [];
      voices += measureVoices.length;
      measureVoices.forEach((voice) => {
        notes += voice && Array.isArray(voice.notes) ? voice.notes.length : 0;
      });
    });
  });
  return { staves: staves.length, measures, voices, notes };
}

function sameScoreShape(a, b) {
  return a.staves === b.staves && a.measures === b.measures && a.voices === b.voices && a.notes === b.notes;
}

function normalizePitch(pitch) {
  if (!pitch) return null;
  return {
    letter: String(pitch.letter || ''),
    octave: Number(pitch.octave || 0),
    accidental: String(pitch.accidental || ''),
    cents: Number(pitch.cents || 0)
  };
}

function semanticScoreSignature(score) {
  const staves = Array.isArray(score && score.staves) ? score.staves : [];
  return staves.map((staff, staffIx) => ({
    staff: staffIx,
    measures: (Array.isArray(staff.measures) ? staff.measures : []).map((measure, measureIx) => {
      const tempo = typeof measure.getTempo === 'function' ? measure.getTempo() : null;
      const time = measure.timeSignature || {};
      return {
        measure: measureIx,
        keySignature: String(measure.keySignature || ''),
        tempo: {
          bpm: Number((tempo && tempo.bpm) || 0),
          beatDuration: Number((tempo && tempo.beatDuration) || 0)
        },
        time: {
          actualBeats: Number(time.actualBeats || 0),
          beatDuration: Number(time.beatDuration || 0)
        },
        voices: (Array.isArray(measure.voices) ? measure.voices : []).map((voice, voiceIx) => ({
          voice: voiceIx,
          notes: (voice && Array.isArray(voice.notes) ? voice.notes : []).map((note) => ({
            noteType: String(note.noteType || ''),
            tickCount: Number(note.tickCount || 0),
            pitches: (Array.isArray(note.pitches) ? note.pitches : []).map(normalizePitch),
            graceCount: Array.isArray(note.graceNotes) ? note.graceNotes.length : 0
          }))
        }))
      };
    })
  }));
}

function sameSemanticScore(a, b) {
  return JSON.stringify(semanticScoreSignature(a)) === JSON.stringify(semanticScoreSignature(b));
}

function serializeCurrentMusicXml() {
  if (!editorReady || !applicationInstance || !applicationInstance.view) {
    throw new Error('Editör henüz hazır değil');
  }

  stopNativePlayback();
  const sourceScore = applicationInstance.view.storeScore || applicationInstance.view.score;
  const xmlDom = SmoToXml.convert(sourceScore);
  const xmlText = new XMLSerializer().serializeToString(xmlDom);
  if (!xmlText || !xmlText.includes('<score-')) throw new Error('MusicXML üretilemedi');

  const parsed = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (parsed.querySelector('parsererror')) throw new Error('Üretilen MusicXML yeniden ayrıştırılamadı');
  const roundTripScore = XmlToSmo.convert(parsed);
  const shapeOk = sameScoreShape(scoreShape(sourceScore), scoreShape(roundTripScore));
  const semanticOk = sameSemanticScore(sourceScore, roundTripScore);
  const roundTripOk = shapeOk && semanticOk;
  const fileName = `${currentScoreBaseName}-edited.musicxml`;

  return {
    musicXml: xmlText,
    fileName,
    roundTripOk,
    shapeOk,
    semanticOk
  };
}

async function exportMusicXml() {
  setStatus('MusicXML hazırlanıyor…');
  const serialized = serializeCurrentMusicXml();
  const { musicXml, fileName, roundTripOk, shapeOk } = serialized;
  const file = new File([musicXml], fileName, { type: 'application/vnd.recordare.musicxml+xml' });
  setStatus(roundTripOk
    ? 'MusicXML semantic round-trip doğrulandı'
    : `MusicXML üretildi · ${shapeOk ? 'semantic fark' : 'yapı farkı'} tespit edildi`);

  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return;
    } catch (error) {
      if (error && error.name === 'AbortError') {
        setStatus('MusicXML paylaşımı iptal edildi');
        return;
      }
      console.warn('Web Share başarısız, indirme yoluna geçiliyor', error);
    }
  }

  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const SESLITAB_EXPORT_REQUEST = 'seslitab:smoosic-export-request';
const SESLITAB_EXPORT_RESULT = 'seslitab:smoosic-export-result';
const SESLITAB_EXPORT_VERSION = 1;

function handleSesliTabExportRequest(event) {
  if (event.source !== parent) return;
  if (event.origin !== window.location.origin) return;

  const message = event.data;
  if (!message || typeof message !== 'object') return;
  if (message.type !== SESLITAB_EXPORT_REQUEST) return;
  if (message.version !== 1) return;
  if (typeof message.requestId !== 'string' || !message.requestId) return;
  if (!Number.isSafeInteger(message.sourceRevision) || message.sourceRevision < 0) return;

  try {
    const serialized = serializeCurrentMusicXml();
    event.source.postMessage({
      type: SESLITAB_EXPORT_RESULT,
      version: SESLITAB_EXPORT_VERSION,
      requestId: message.requestId,
      sourceRevision: message.sourceRevision,
      fileName: serialized.fileName,
      musicXml: serialized.musicXml,
      roundTripOk: serialized.roundTripOk,
      shapeOk: serialized.shapeOk,
      semanticOk: serialized.semanticOk
    }, event.origin);
  } catch (error) {
    event.source.postMessage({
      type: SESLITAB_EXPORT_RESULT,
      version: SESLITAB_EXPORT_VERSION,
      requestId: message.requestId,
      sourceRevision: message.sourceRevision,
      fileName: `${currentScoreBaseName}-edited.musicxml`,
      musicXml: '',
      error: String(error && error.message ? error.message : 'MusicXML üretilemedi')
    }, event.origin);
  }
}

function wireNativeTransportGuard() {
  document.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const playButton = target.closest('#playButton2');
    if (!playButton || !editorReady) return;

    if (mobileSoundfonts[activePlaybackInstrument]) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    try {
      await loadInstrumentSound(activePlaybackInstrument);
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
      stopMetronomeTimeline();
      selectionPreviewToken += 1;
      activePlaybackStartPoint = null;
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

  const exportButton = document.getElementById('mobile-xml-export');
  if (exportButton) exportButton.addEventListener('click', async () => {
    try { await exportMusicXml(); }
    catch (error) { console.error(error); setStatus(`XML export hatası: ${String(error)}`); }
  });

  const metronomeButton = document.getElementById('mobile-metronome');
  if (metronomeButton) metronomeButton.addEventListener('click', toggleMetronome);

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
  window.addEventListener('message', handleSesliTabExportRequest);
  updateMetronomeButton();
  setEditorControlsEnabled(false);
  window.addEventListener('error', (event) => setStatus(`Hata: ${event.message || 'bilinmeyen hata'}`));
  window.addEventListener('unhandledrejection', (event) => setStatus(`Hata: ${String(event.reason || 'başlatma reddedildi')}`));

  try {
    setStatus('Editör başlatılıyor…');

    SuiSampleMedia.samplePromise = async (_audio, setProgress) => {
      if (typeof setProgress === 'function') setProgress(100);
    };

    const bridgeReady = installNativeAudioBridge();
    const exactStartReady = installExactStartBridge();
    const previewReady = installSelectionPreviewBridge();
    wrapNativeStop();

    const initialScore = SmoScore.getDefaultScore(SmoScore.defaults, null);
    applicationInstance = await SuiApplication.configure({ mode: 'application', domContainer, initialScore });
    const rendered = Boolean(applicationInstance && applicationInstance.view && applicationInstance.view.renderer);
    editorReady = rendered;
    if (rendered) {
      wrapNativePlay();
      wrapNativeAudioAnimation();
    }
    setEditorControlsEnabled(rendered);

    if (!rendered) setStatus('Renderer oluşmadı');
    else if (!bridgeReady) setStatus('Editör hazır · native ses köprüsü bulunamadı');
    else if (!exactStartReady) setStatus('Editör hazır · nota başlangıç köprüsü bulunamadı');
    else if (!previewReady) setStatus('Editör hazır · nota ön dinleme köprüsü bulunamadı');
    else setStatus('Editör hazır · notaya dokununca piyano ön dinleme aktif');
  } catch (error) {
    console.error(error);
    editorReady = false;
    setEditorControlsEnabled(false);
    setStatus(`Başlatma hatası: ${String(error)}`);
  }
}

document.addEventListener('DOMContentLoaded', boot);
