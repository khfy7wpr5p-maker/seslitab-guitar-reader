const {
  SmoToXml,
  XmlToSmo
} = require('smoosic');

let pendingAudit = null;
let pendingAuditTimer = null;

const originalSmoToXmlConvert = SmoToXml.convert.bind(SmoToXml);
const originalXmlToSmoConvert = XmlToSmo.convert.bind(XmlToSmo);

const DROP_KEYS = new Set([
  'attrs',
  'id',
  'renderId',
  'logicalBox',
  'vexNote',
  'beam_group',
  'tupletId',
  'parentTuplet'
]);

function ctorName(value) {
  if (!value) return '';
  return String(value.ctor || (value.attrs && value.attrs.type) || (value.constructor && value.constructor.name) || '');
}

function scrub(value, depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'function') return undefined;
  if (depth > 12) return '[depth-limit]';
  if (Array.isArray(value)) {
    return value.map((item) => scrub(item, depth + 1, seen)).filter((item) => item !== undefined);
  }
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[cycle]';
  seen.add(value);
  const out = {};
  Object.keys(value).sort().forEach((key) => {
    if (DROP_KEYS.has(key)) return;
    const cleaned = scrub(value[key], depth + 1, seen);
    if (cleaned !== undefined) out[key] = cleaned;
  });
  seen.delete(value);
  return out;
}

function serializable(value) {
  if (!value) return null;
  try {
    if (typeof value.serialize === 'function') return scrub(value.serialize());
  } catch (error) {
    console.warn('Round-trip serialize uyarısı', error);
  }
  return scrub(value);
}

function canonical(value) {
  return JSON.stringify(value);
}

function normalizedPitch(pitch) {
  if (!pitch) return null;
  return {
    letter: String(pitch.letter || ''),
    octave: Number(pitch.octave || 0),
    accidental: String(pitch.accidental || ''),
    cents: Number(pitch.cents || 0)
  };
}

function normalizedPitchList(note) {
  const pitches = Array.isArray(note && note.pitches) ? note.pitches.map(normalizedPitch) : [];
  return pitches.sort((a, b) => canonical(a).localeCompare(canonical(b)));
}

function normalizedModifierList(items, sort = true) {
  const rv = (Array.isArray(items) ? items : []).map(serializable);
  if (sort) rv.sort((a, b) => canonical(a).localeCompare(canonical(b)));
  return rv;
}

function normalizedTupletTrees(measure) {
  return normalizedModifierList(measure && measure.tupletTrees, true);
}

function normalizedNote(note) {
  return {
    noteType: String((note && note.noteType) || ''),
    tickCount: Number((note && note.tickCount) || 0),
    stemTicks: Number((note && note.stemTicks) || 0),
    clef: String((note && note.clef) || ''),
    noteHead: String((note && note.noteHead) || ''),
    hidden: Boolean(note && note.hidden),
    isCue: Boolean(note && note.isCue),
    beamState: Number((note && note.beamState) || 0),
    flagState: Number((note && note.flagState) || 0),
    pitches: normalizedPitchList(note),
    articulations: normalizedModifierList(note && note.articulations),
    ornaments: normalizedModifierList(note && note.ornaments),
    graceNotes: normalizedModifierList(note && note.graceNotes, false),
    microtones: normalizedModifierList(note && note.tones),
    arpeggio: serializable(note && note.arpeggio),
    textModifiers: normalizedModifierList(note && note.textModifiers, false)
  };
}

function normalizedTempo(measure) {
  const tempo = measure && typeof measure.getTempo === 'function' ? measure.getTempo() : null;
  return {
    bpm: Number((tempo && tempo.bpm) || 0),
    beatDuration: Number((tempo && tempo.beatDuration) || 0)
  };
}

function normalizedTime(measure) {
  const time = (measure && measure.timeSignature) || {};
  return {
    actualBeats: Number(time.actualBeats || 0),
    beatDuration: Number(time.beatDuration || 0)
  };
}

function relevantStaffModifiers(staff) {
  const modifiers = Array.isArray(staff && staff.modifiers) ? staff.modifiers : [];
  return modifiers
    .filter((modifier) => {
      const ctor = ctorName(modifier);
      return ctor === 'SmoTie' || ctor === 'SmoSlur';
    })
    .map((modifier) => ({ ctor: ctorName(modifier), data: serializable(modifier) }))
    .sort((a, b) => canonical(a).localeCompare(canonical(b)));
}

function countTuplet(tuplet) {
  if (!tuplet) return 0;
  let count = 1;
  const children = Array.isArray(tuplet.childrenTuplets) ? tuplet.childrenTuplets : [];
  children.forEach((child) => { count += countTuplet(child); });
  return count;
}

function collectStats(score) {
  const stats = {
    staves: 0,
    measures: 0,
    voices: 0,
    maxVoices: 0,
    notes: 0,
    graceNotes: 0,
    articulations: 0,
    ornaments: 0,
    tuplets: 0,
    ties: 0,
    slurs: 0
  };
  const staves = Array.isArray(score && score.staves) ? score.staves : [];
  stats.staves = staves.length;
  staves.forEach((staff) => {
    relevantStaffModifiers(staff).forEach((modifier) => {
      if (modifier.ctor === 'SmoTie') stats.ties += 1;
      if (modifier.ctor === 'SmoSlur') stats.slurs += 1;
    });
    const measures = Array.isArray(staff.measures) ? staff.measures : [];
    stats.measures += measures.length;
    measures.forEach((measure) => {
      const voices = Array.isArray(measure.voices) ? measure.voices : [];
      stats.voices += voices.length;
      stats.maxVoices = Math.max(stats.maxVoices, voices.length);
      const trees = Array.isArray(measure.tupletTrees) ? measure.tupletTrees : [];
      trees.forEach((tree) => { stats.tuplets += countTuplet(tree && tree.tuplet); });
      voices.forEach((voice) => {
        const notes = voice && Array.isArray(voice.notes) ? voice.notes : [];
        stats.notes += notes.length;
        notes.forEach((note) => {
          stats.graceNotes += Array.isArray(note.graceNotes) ? note.graceNotes.length : 0;
          stats.articulations += Array.isArray(note.articulations) ? note.articulations.length : 0;
          stats.ornaments += Array.isArray(note.ornaments) ? note.ornaments.length : 0;
        });
      });
    });
  });
  return stats;
}

function mismatch(category, location, before, after) {
  return {
    ok: false,
    category,
    location,
    before,
    after
  };
}

function compareScores(beforeScore, afterScore) {
  const beforeStats = collectStats(beforeScore);
  const afterStats = collectStats(afterScore);
  const beforeStaves = Array.isArray(beforeScore && beforeScore.staves) ? beforeScore.staves : [];
  const afterStaves = Array.isArray(afterScore && afterScore.staves) ? afterScore.staves : [];

  if (beforeStaves.length !== afterStaves.length) {
    return { ...mismatch('staff', 'score', beforeStaves.length, afterStaves.length), beforeStats, afterStats };
  }

  for (let staffIx = 0; staffIx < beforeStaves.length; staffIx += 1) {
    const beforeStaff = beforeStaves[staffIx];
    const afterStaff = afterStaves[staffIx];
    const beforeMeasures = Array.isArray(beforeStaff.measures) ? beforeStaff.measures : [];
    const afterMeasures = Array.isArray(afterStaff.measures) ? afterStaff.measures : [];
    if (beforeMeasures.length !== afterMeasures.length) {
      return { ...mismatch('measure-count', `staff ${staffIx + 1}`, beforeMeasures.length, afterMeasures.length), beforeStats, afterStats };
    }

    const beforeLinks = relevantStaffModifiers(beforeStaff);
    const afterLinks = relevantStaffModifiers(afterStaff);
    if (canonical(beforeLinks) !== canonical(afterLinks)) {
      return { ...mismatch('tie/slur', `staff ${staffIx + 1}`, beforeLinks, afterLinks), beforeStats, afterStats };
    }

    for (let measureIx = 0; measureIx < beforeMeasures.length; measureIx += 1) {
      const beforeMeasure = beforeMeasures[measureIx];
      const afterMeasure = afterMeasures[measureIx];
      const loc = `staff ${staffIx + 1} · ölçü ${measureIx + 1}`;

      if (String(beforeMeasure.keySignature || '') !== String(afterMeasure.keySignature || '')) {
        return { ...mismatch('key-signature', loc, beforeMeasure.keySignature, afterMeasure.keySignature), beforeStats, afterStats };
      }
      if (canonical(normalizedTempo(beforeMeasure)) !== canonical(normalizedTempo(afterMeasure))) {
        return { ...mismatch('tempo', loc, normalizedTempo(beforeMeasure), normalizedTempo(afterMeasure)), beforeStats, afterStats };
      }
      if (canonical(normalizedTime(beforeMeasure)) !== canonical(normalizedTime(afterMeasure))) {
        return { ...mismatch('time-signature', loc, normalizedTime(beforeMeasure), normalizedTime(afterMeasure)), beforeStats, afterStats };
      }
      if (canonical(normalizedTupletTrees(beforeMeasure)) !== canonical(normalizedTupletTrees(afterMeasure))) {
        return { ...mismatch('tuplet', loc, normalizedTupletTrees(beforeMeasure), normalizedTupletTrees(afterMeasure)), beforeStats, afterStats };
      }

      const beforeVoices = Array.isArray(beforeMeasure.voices) ? beforeMeasure.voices : [];
      const afterVoices = Array.isArray(afterMeasure.voices) ? afterMeasure.voices : [];
      if (beforeVoices.length !== afterVoices.length) {
        return { ...mismatch('voice-count', loc, beforeVoices.length, afterVoices.length), beforeStats, afterStats };
      }

      for (let voiceIx = 0; voiceIx < beforeVoices.length; voiceIx += 1) {
        const beforeNotes = beforeVoices[voiceIx] && Array.isArray(beforeVoices[voiceIx].notes) ? beforeVoices[voiceIx].notes : [];
        const afterNotes = afterVoices[voiceIx] && Array.isArray(afterVoices[voiceIx].notes) ? afterVoices[voiceIx].notes : [];
        if (beforeNotes.length !== afterNotes.length) {
          return { ...mismatch('note-count', `${loc} · voice ${voiceIx + 1}`, beforeNotes.length, afterNotes.length), beforeStats, afterStats };
        }
        for (let noteIx = 0; noteIx < beforeNotes.length; noteIx += 1) {
          const beforeNote = normalizedNote(beforeNotes[noteIx]);
          const afterNote = normalizedNote(afterNotes[noteIx]);
          if (canonical(beforeNote) !== canonical(afterNote)) {
            return {
              ...mismatch('note-semantic', `${loc} · voice ${voiceIx + 1} · nota ${noteIx + 1}`, beforeNote, afterNote),
              beforeStats,
              afterStats
            };
          }
        }
      }
    }
  }

  return { ok: true, beforeStats, afterStats };
}

function statusElement() {
  return document.getElementById('poc-status');
}

function publishAudit(result) {
  window.__smoosicRoundTripAudit = result;
  const status = statusElement();
  if (!status) return;
  if (result.ok) {
    const s = result.afterStats;
    status.textContent = `MusicXML gelişmiş round-trip doğrulandı · ${s.staves} staff · max ${s.maxVoices} voice · ${s.ties} tie · ${s.slurs} slur · ${s.tuplets} tuplet · ${s.graceNotes} grace`;
    return;
  }
  status.textContent = `MusicXML gelişmiş fark: ${result.category} · ${result.location}`;
}

SmoToXml.convert = function hardenedSmoToXmlConvert(score, ...args) {
  pendingAudit = {
    score,
    createdAt: Date.now()
  };
  if (pendingAuditTimer) clearTimeout(pendingAuditTimer);
  pendingAuditTimer = setTimeout(() => {
    pendingAudit = null;
    pendingAuditTimer = null;
  }, 8000);
  try {
    return originalSmoToXmlConvert(score, ...args);
  } catch (error) {
    pendingAudit = null;
    if (pendingAuditTimer) clearTimeout(pendingAuditTimer);
    pendingAuditTimer = null;
    throw error;
  }
};

XmlToSmo.convert = function hardenedXmlToSmoConvert(xml, ...args) {
  const converted = originalXmlToSmoConvert(xml, ...args);
  const audit = pendingAudit;
  if (!audit) return converted;

  pendingAudit = null;
  if (pendingAuditTimer) clearTimeout(pendingAuditTimer);
  pendingAuditTimer = null;

  setTimeout(() => {
    try {
      const result = compareScores(audit.score, converted);
      publishAudit(result);
    } catch (error) {
      console.error('Gelişmiş MusicXML round-trip audit hatası', error);
      window.__smoosicRoundTripAudit = { ok: false, category: 'audit-error', error: String(error) };
      const status = statusElement();
      if (status) status.textContent = `MusicXML audit hatası: ${String(error)}`;
    }
  }, 30);

  return converted;
};
