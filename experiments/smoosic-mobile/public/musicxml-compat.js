(() => {
  const GRID_TICKS = 128;
  const TYPE_SPECS = [
    ['whole', 4],
    ['half', 2],
    ['quarter', 1],
    ['eighth', 1 / 2],
    ['16th', 1 / 4],
    ['32nd', 1 / 8],
    ['64th', 1 / 16],
    ['128th', 1 / 32]
  ];
  let redispatching = false;
  let tupletNumber = 900;

  function directChildren(node, tagName) {
    return Array.from(node.children || []).filter((child) => child.tagName === tagName);
  }

  function directChild(node, tagName) {
    return directChildren(node, tagName)[0] || null;
  }

  function childNumber(node, tagName, fallback = 0) {
    const child = directChild(node, tagName);
    const value = child ? Number(String(child.textContent || '').trim()) : fallback;
    return Number.isFinite(value) ? value : fallback;
  }

  function childText(node, tagName, fallback = '') {
    const child = directChild(node, tagName);
    return child ? String(child.textContent || '').trim() : fallback;
  }

  function isGridAligned(duration, divisions) {
    if (!(duration >= 0) || !(divisions > 0)) return true;
    const ticks = (4096 * duration) / divisions;
    const units = ticks / GRID_TICKS;
    return Math.abs(units - Math.round(units)) < 1e-7;
  }

  function spacerCandidates(divisions) {
    const candidates = [];
    TYPE_SPECS.forEach(([type, quarterUnits]) => {
      const base = divisions * quarterUnits;
      if (Math.abs(base - Math.round(base)) < 1e-7 && Math.round(base) >= 1) {
        candidates.push({
          duration: Math.round(base),
          type,
          tuplet: false,
          actualNotes: 1,
          normalNotes: 1
        });
      }
      const triplet = (base * 2) / 3;
      if (Math.abs(triplet - Math.round(triplet)) < 1e-7 && Math.round(triplet) >= 1) {
        candidates.push({
          duration: Math.round(triplet),
          type,
          tuplet: true,
          actualNotes: 3,
          normalNotes: 2
        });
      }
    });

    const deduped = new Map();
    candidates.forEach((candidate) => {
      const key = `${candidate.duration}:${candidate.tuplet ? 't' : 'r'}`;
      if (!deduped.has(key)) deduped.set(key, candidate);
    });

    return Array.from(deduped.values()).sort((a, b) => {
      if (a.tuplet !== b.tuplet) return a.tuplet ? 1 : -1;
      return b.duration - a.duration;
    });
  }

  function decomposeDuration(target, divisions) {
    const total = Math.round(Number(target));
    if (!(total > 0) || Math.abs(Number(target) - total) > 1e-7) return null;
    const candidates = spacerCandidates(divisions).filter((candidate) => candidate.duration <= total);
    const best = new Array(total + 1).fill(null);
    best[0] = { cost: 0, chunks: [] };

    for (let value = 1; value <= total; value += 1) {
      let winner = null;
      candidates.forEach((candidate) => {
        const prev = value >= candidate.duration ? best[value - candidate.duration] : null;
        if (!prev) return;
        const cost = prev.cost + (candidate.tuplet ? 100 : 1);
        const chunks = prev.chunks.concat(candidate);
        if (!winner
            || cost < winner.cost
            || (cost === winner.cost && chunks.length < winner.chunks.length)) {
          winner = { cost, chunks };
        }
      });
      best[value] = winner;
    }
    return best[total] ? best[total].chunks : null;
  }

  function createElement(doc, name, text) {
    const el = doc.createElement(name);
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  }

  function createSpacerNote(doc, chunk, voice, staff) {
    const note = doc.createElement('note');
    note.setAttribute('print-object', 'no');
    note.setAttribute('print-spacing', 'yes');
    note.setAttribute('data-seslitab-smoosic-spacer', 'yes');
    note.appendChild(doc.createElement('rest'));
    note.appendChild(createElement(doc, 'duration', chunk.duration));
    if (voice) note.appendChild(createElement(doc, 'voice', voice));
    if (staff) note.appendChild(createElement(doc, 'staff', staff));
    note.appendChild(createElement(doc, 'type', chunk.type));

    if (chunk.tuplet) {
      const timeModification = doc.createElement('time-modification');
      timeModification.appendChild(createElement(doc, 'actual-notes', chunk.actualNotes));
      timeModification.appendChild(createElement(doc, 'normal-notes', chunk.normalNotes));
      note.appendChild(timeModification);

      const notations = doc.createElement('notations');
      const number = String(tupletNumber++);
      const start = doc.createElement('tuplet');
      start.setAttribute('type', 'start');
      start.setAttribute('number', number);
      start.setAttribute('bracket', 'no');
      start.setAttribute('show-number', 'none');
      const stop = doc.createElement('tuplet');
      stop.setAttribute('type', 'stop');
      stop.setAttribute('number', number);
      notations.appendChild(start);
      notations.appendChild(stop);
      note.appendChild(notations);
    }
    return note;
  }

  function insertSpacerChunks(measure, beforeNode, chunks, voice, staff) {
    chunks.forEach((chunk) => {
      measure.insertBefore(createSpacerNote(measure.ownerDocument, chunk, voice, staff), beforeNode || null);
    });
  }

  function analyzeMeasure(measure, inheritedDivisions) {
    let divisions = inheritedDivisions;
    const attrNodes = directChildren(measure, 'attributes');
    attrNodes.forEach((attributes) => {
      const divNode = directChild(attributes, 'divisions');
      if (divNode) {
        const value = Number(String(divNode.textContent || '').trim());
        if (Number.isFinite(value) && value > 0) divisions = value;
      }
    });

    let cursor = 0;
    let segment = {
      start: 0,
      end: 0,
      voices: new Set(),
      staffByVoice: new Map(),
      forwards: [],
      backup: null,
      lastTimingIndex: -1
    };
    const segments = [];
    const children = Array.from(measure.children || []);

    function recordVoice(node) {
      const voice = childText(node, 'voice', '');
      if (voice) {
        segment.voices.add(voice);
        const staff = childText(node, 'staff', '');
        if (staff && !segment.staffByVoice.has(voice)) segment.staffByVoice.set(voice, staff);
      }
      return voice;
    }

    children.forEach((child, index) => {
      if (child.tagName === 'note') {
        recordVoice(child);
        const chord = Boolean(directChild(child, 'chord'));
        if (!chord) cursor += childNumber(child, 'duration', 0);
        segment.end = cursor;
        segment.lastTimingIndex = index;
      } else if (child.tagName === 'forward') {
        const voice = recordVoice(child);
        const duration = childNumber(child, 'duration', 0);
        cursor += duration;
        segment.end = cursor;
        segment.lastTimingIndex = index;
        segment.forwards.push({ node: child, duration, voice, staff: childText(child, 'staff', '') });
      } else if (child.tagName === 'backup') {
        segment.end = cursor;
        segment.backup = child;
        segments.push(segment);
        const duration = childNumber(child, 'duration', 0);
        cursor -= duration;
        segment = {
          start: cursor,
          end: cursor,
          voices: new Set(),
          staffByVoice: new Map(),
          forwards: [],
          backup: null,
          lastTimingIndex: index
        };
      }
    });
    segment.end = cursor;
    segments.push(segment);

    const targetEnd = segments.reduce((max, item) => Math.max(max, item.end), 0);
    return { divisions, targetEnd, segments, children };
  }

  function normalizeMeasure(measure, inheritedDivisions) {
    const analysis = analyzeMeasure(measure, inheritedDivisions);
    const { divisions, targetEnd, segments, children } = analysis;
    let problematic = false;

    segments.forEach((segment) => {
      segment.forwards.forEach((forward) => {
        if (!isGridAligned(forward.duration, divisions)) problematic = true;
      });
      const gap = targetEnd - segment.end;
      if (gap > 0 && !isGridAligned(gap, divisions)) problematic = true;
    });

    if (!problematic) return { divisions, changed: false, spacers: 0, reason: '' };

    const plans = [];
    for (const segment of segments) {
      if (segment.voices.size !== 1) {
        return { divisions, changed: false, spacers: 0, reason: 'mixed-voice segment' };
      }
      const voice = Array.from(segment.voices)[0] || '';
      const staff = voice ? (segment.staffByVoice.get(voice) || '') : '';
      for (const forward of segment.forwards) {
        const chunks = decomposeDuration(forward.duration, divisions);
        if (!forward.voice || !chunks) {
          return { divisions, changed: false, spacers: 0, reason: 'forward decomposition unavailable' };
        }
        plans.push({ kind: 'forward', forward, chunks });
      }
      const gap = targetEnd - segment.end;
      if (gap > 0) {
        const chunks = decomposeDuration(gap, divisions);
        if (!voice || !chunks) {
          return { divisions, changed: false, spacers: 0, reason: 'trailing gap decomposition unavailable' };
        }
        plans.push({ kind: 'tail', segment, voice, staff, gap, chunks });
      }
    }

    let spacers = 0;
    plans.filter((plan) => plan.kind === 'tail').forEach((plan) => {
      const segment = plan.segment;
      let beforeNode = segment.backup;
      if (!beforeNode) {
        const trailing = children.find((child, index) =>
          index > segment.lastTimingIndex && (child.tagName === 'barline' || child.tagName === 'print'));
        beforeNode = trailing || null;
      }
      insertSpacerChunks(measure, beforeNode, plan.chunks, plan.voice, plan.staff);
      spacers += plan.chunks.length;
      if (segment.backup) {
        const durationNode = directChild(segment.backup, 'duration');
        if (durationNode) {
          const oldDuration = Number(String(durationNode.textContent || '').trim()) || 0;
          durationNode.textContent = String(oldDuration + plan.gap);
        }
      }
    });

    plans.filter((plan) => plan.kind === 'forward').forEach((plan) => {
      const { forward, chunks } = plan;
      insertSpacerChunks(measure, forward.node, chunks, forward.voice, forward.staff);
      spacers += chunks.length;
      forward.node.remove();
    });

    return { divisions, changed: true, spacers, reason: '' };
  }

  function normalizeMusicXml(text) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(text || ''), 'text/xml');
    if (doc.querySelector('parsererror') || !doc.getElementsByTagName('score-partwise').length) {
      return { text, changed: false, measures: [], spacers: 0, skipped: [] };
    }

    let divisions = 1;
    let totalSpacers = 0;
    const changedMeasures = [];
    const skipped = [];
    const parts = Array.from(doc.getElementsByTagName('part'));

    parts.forEach((part) => {
      const measures = directChildren(part, 'measure');
      measures.forEach((measure, index) => {
        const result = normalizeMeasure(measure, divisions);
        divisions = result.divisions;
        if (result.changed) {
          changedMeasures.push(String(measure.getAttribute('number') || index + 1));
          totalSpacers += result.spacers;
        } else if (result.reason) {
          skipped.push({
            measure: String(measure.getAttribute('number') || index + 1),
            reason: result.reason
          });
        }
      });
    });

    if (!changedMeasures.length) {
      return { text, changed: false, measures: [], spacers: 0, skipped };
    }

    const serialized = new XMLSerializer().serializeToString(doc);
    return {
      text: serialized,
      changed: true,
      measures: changedMeasures,
      spacers: totalSpacers,
      skipped
    };
  }

  async function intercept(event) {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement) || redispatching) return;
    const file = input.files && input.files[0];
    if (!file || !/\.(xml|musicxml|mxml)$/i.test(String(file.name || ''))) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    try {
      const originalText = await file.text();
      const result = normalizeMusicXml(originalText);
      window.__smoosicMusicXmlCompat = {
        file: file.name,
        changed: result.changed,
        measures: result.measures,
        spacers: result.spacers,
        skipped: result.skipped
      };

      if (!result.changed) {
        redispatching = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        redispatching = false;
        return;
      }

      const normalized = new File([result.text], file.name, {
        type: file.type || 'application/vnd.recordare.musicxml+xml',
        lastModified: file.lastModified || Date.now()
      });
      const transfer = new DataTransfer();
      transfer.items.add(normalized);
      input.files = transfer.files;

      redispatching = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      redispatching = false;
    } catch (error) {
      console.error('Smoosic MusicXML uyumluluk katmanı hatası', error);
      window.__smoosicMusicXmlCompat = {
        file: file.name,
        changed: false,
        error: String(error)
      };
      redispatching = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      redispatching = false;
    }
  }

  function install() {
    const input = document.getElementById('mobile-xml-input');
    if (!input) return;
    input.addEventListener('change', intercept, true);
    window.__normalizeSmoosicMusicXml = normalizeMusicXml;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();