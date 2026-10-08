#!/usr/bin/env python3
"""Emit pinned read-only semantic snapshots and TAB technical positions for CI fixtures."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import partitura

from st_score_semantic_engine.adapters.partitura_musicxml import load_musicxml_snapshot
from st_score_semantic_engine.serialization import snapshot_to_dict

MAX_XML_BYTES = 20 * 1024 * 1024
STEP_TO_SEMITONE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def safe_root(path: Path) -> ET.Element:
    raw = path.read_bytes()
    if len(raw) == 0 or len(raw) > MAX_XML_BYTES:
        raise ValueError("MusicXML fixture is empty or exceeds the qualification size bound.")
    upper = raw.upper()
    if b"<!DOCTYPE" in upper or b"<!ENTITY" in upper:
        raise ValueError("DTD/entity declarations are unsupported in GTAB-10C qualification fixtures.")
    root = ET.fromstring(raw)
    if root.tag != "score-partwise":
        raise ValueError("GTAB-10C fixture must be score-partwise MusicXML.")
    return root


def midi_pitch(note: ET.Element) -> int | None:
    pitch = note.find("pitch")
    if pitch is None:
        return None
    step = pitch.findtext("step")
    octave_text = pitch.findtext("octave")
    alter_text = pitch.findtext("alter")
    if step not in STEP_TO_SEMITONE or octave_text is None:
        return None
    octave = int(octave_text)
    alter = float(alter_text) if alter_text is not None else 0
    midi = int((octave + 1) * 12 + STEP_TO_SEMITONE[step] + alter)
    if midi < 0 or midi > 127:
        return None
    return midi


def note_tie_flags(note: ET.Element) -> tuple[bool, bool]:
    starts = any(tie.get("type") == "start" for tie in note.findall("tie"))
    stops = any(tie.get("type") == "stop" for tie in note.findall("tie"))
    if not starts:
        starts = any(tied.get("type") == "start" for tied in note.findall("notations/tied"))
    if not stops:
        stops = any(tied.get("type") == "stop" for tied in note.findall("notations/tied"))
    return stops, starts


def tab_positions(path: Path, snapshot: dict[str, object]) -> list[dict[str, object]]:
    root = safe_root(path)
    score = partitura.load_musicxml(path, force_note_ids=None)
    xml_parts = root.findall("part")
    if len(xml_parts) != len(score.parts):
        raise ValueError("Partitura/XML part inventory is ambiguous.")

    notes = snapshot.get("notes")
    if not isinstance(notes, list):
        raise ValueError("Semantic snapshot has no note rows.")
    remaining = [note for note in notes if isinstance(note, dict) and note.get("staff") == 2]
    positions: list[dict[str, object]] = []

    for part_index, xml_part in enumerate(xml_parts):
        part_id = xml_part.get("id")
        part = score.parts[part_index]
        measures = list(part.measures)
        xml_measures = xml_part.findall("measure")
        if len(measures) != len(xml_measures):
            raise ValueError("Partitura/XML measure mapping is ambiguous.")

        divisions: int | None = None
        for measure_index, measure in enumerate(xml_measures):
            measure_start = getattr(measures[measure_index], "start", None)
            if measure_start is None:
                raise ValueError("Partitura did not expose measure start positions.")
            absolute_measure_start = int(measure_start.t)
            cursor = 0
            last_non_chord_onset = 0
            attributes = measure.find("attributes")
            divisions_text = attributes.findtext("divisions") if attributes is not None else None
            if divisions_text is not None:
                divisions = int(divisions_text)
            if divisions is None or divisions <= 0:
                raise ValueError("MusicXML measure has no valid divisions context.")

            for child in measure:
                if child.tag in ("backup", "forward"):
                    duration_text = child.findtext("duration")
                    if duration_text is None:
                        raise ValueError("MusicXML backup/forward has no duration.")
                    duration = int(duration_text)
                    cursor += -duration if child.tag == "backup" else duration
                    if cursor < 0:
                        raise ValueError("MusicXML measure cursor moved before measure start.")
                    continue
                if child.tag != "note":
                    continue

                is_chord = child.find("chord") is not None
                if child.find("grace") is not None or child.find("rest") is not None:
                    duration_text = child.findtext("duration")
                    if duration_text is not None and not is_chord:
                        last_non_chord_onset = cursor
                        cursor += int(duration_text)
                    continue

                pitch = midi_pitch(child)
                duration_text = child.findtext("duration")
                if pitch is None or duration_text is None:
                    raise ValueError("Pitched TAB-staff fixture note lacks pitch or duration.")
                duration = int(duration_text)
                local_onset = last_non_chord_onset if is_chord else cursor
                if not is_chord:
                    last_non_chord_onset = local_onset
                    cursor += duration
                staff = int(child.findtext("staff") or "1")
                if staff != 2:
                    continue
                voice = int(child.findtext("voice") or "1")
                tie_stop, tie_start = note_tie_flags(child)
                onset = absolute_measure_start + local_onset
                candidates = [note for note in remaining
                    if note.get("part_id") == part_id
                    and note.get("measure_index") == measure_index
                    and note.get("pitch_midi") == pitch
                    and note.get("onset_div") == onset
                    and note.get("duration_div") == duration
                    and note.get("voice") == voice
                    and note.get("staff") == 2]
                if len(candidates) != 1:
                    raise ValueError("TAB technical data cannot be matched uniquely to a semantic event.")
                semantic_note = candidates[0]
                remaining.remove(semantic_note)
                technical = child.find("notations/technical")
                string_text = technical.findtext("string") if technical is not None else None
                fret_text = technical.findtext("fret") if technical is not None else None
                position: dict[str, object] = {
                    key: semantic_note[key]
                    for key in ("measure_index", "pitch_midi", "onset_div", "duration_div", "voice", "tie_prev", "tie_next")
                }
                position["tie_stop_xml"] = tie_stop
                position["tie_start_xml"] = tie_start
                position["string"] = int(string_text) if string_text is not None else None
                position["fret"] = int(fret_text) if fret_text is not None else None
                positions.append(position)

    if remaining:
        raise ValueError("Semantic TAB events were not represented in MusicXML technical positions.")
    return positions


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("derived", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    safe_root(args.source)
    safe_root(args.derived)
    source_snapshot = snapshot_to_dict(load_musicxml_snapshot(args.source))
    derived_snapshot = snapshot_to_dict(load_musicxml_snapshot(args.derived))
    payload = {
        "sourceSnapshot": source_snapshot,
        "derivedSnapshot": derived_snapshot,
        "tabPositions": tab_positions(args.derived, derived_snapshot),
        "partituraVersion": importlib.metadata.version("partitura"),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
