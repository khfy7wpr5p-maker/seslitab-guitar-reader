#!/usr/bin/env python3
"""Emit pinned read-only semantic snapshots and TAB technical positions for CI fixtures."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import hashlib
import math
import tempfile
import os
import stat
from pathlib import Path
from defusedxml import ElementTree as ET
from defusedxml.common import DefusedXmlException
from xml.etree.ElementTree import tostring, Element
from copy import deepcopy

import partitura

from st_score_semantic_engine.adapters.partitura_musicxml import load_musicxml_snapshot
from st_score_semantic_engine.serialization import snapshot_to_dict

MAX_XML_BYTES = 20 * 1024 * 1024
STEP_TO_SEMITONE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_ROOT = PROJECT_ROOT / "artifacts/gtab10c-semantic-parity"


def qualified_path(path: Path, *, output: bool = False) -> Path:
    """Resolve symlinks before authorizing a CI fixture/artifact path."""
    resolved = path.resolve()
    roots = [ARTIFACT_ROOT.resolve()]
    if not output:
        roots.append((PROJECT_ROOT / "tests/fixtures/gtab10c").resolve())
    if any(not root.is_relative_to(PROJECT_ROOT) for root in roots):
        raise ValueError("Authorized project root is redirected outside the project.")
    # Private CI test/read-view directories only, never arbitrary filesystem paths.
    temporary = Path(tempfile.gettempdir()).resolve()
    parent = resolved.parent
    if parent.parent == temporary and parent.name.startswith("gtab10c-"):
        metadata = parent.stat()
        if metadata.st_uid != os.getuid() or stat.S_IMODE(metadata.st_mode) & 0o077:
            raise ValueError("GTAB-10C temporary directory must be private and owned by this process user.")
        roots.append(parent)
    if not any(resolved.is_relative_to(root) and resolved != root for root in roots):
        raise ValueError("Path is outside authorized GTAB-10C fixture/artifact roots.")
    if output:
        if resolved.suffix != ".json" or (resolved.exists() and not resolved.is_file()):
            raise ValueError("Oracle output must be a regular JSON artifact.")
    elif not resolved.is_file() or resolved.stat().st_size > MAX_XML_BYTES:
        raise ValueError("Oracle input must be a bounded regular fixture file.")
    return resolved


def read_fixture(path: Path) -> bytes:
    bounded = qualified_path(path)
    with bounded.open("rb") as stream:
        raw = stream.read(MAX_XML_BYTES + 1)
    if not raw or len(raw) > MAX_XML_BYTES:
        raise ValueError("MusicXML fixture is empty or exceeds the qualification size bound.")
    return raw


def safe_root(path: Path, raw: bytes | None = None) -> ET.Element:
    raw = read_fixture(path) if raw is None else raw
    if len(raw) == 0 or len(raw) > MAX_XML_BYTES:
        raise ValueError("MusicXML fixture is empty or exceeds the qualification size bound.")
    upper = raw.upper()
    if b"<!DOCTYPE" in upper or b"<!ENTITY" in upper:
        raise ValueError("DTD/entity declarations are unsupported in GTAB-10C qualification fixtures.")
    try:
        root = ET.fromstring(raw, forbid_dtd=True, forbid_entities=True, forbid_external=True)
    except (DefusedXmlException, ET.ParseError) as error:
        raise ValueError("Unsafe or malformed MusicXML fixture.") from error
    if root.tag != "score-partwise":
        raise ValueError("GTAB-10C fixture must be score-partwise MusicXML.")
    for note in root.findall('.//note'):
        if note.find('pitch') is not None:
            midi_pitch(note)
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
    alter = float(alter_text) if alter_text is not None else 0.0
    if not math.isfinite(alter) or not alter.is_integer():
        raise ValueError("Microtonal/non-finite pitch is unsupported by the integer MIDI oracle.")
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
                position["source_id"] = semantic_note["source_id"]
                position["tie_stop_xml"] = tie_stop
                position["tie_start_xml"] = tie_start
                position["string"] = int(string_text) if string_text is not None else None
                position["fret"] = int(fret_text) if fret_text is not None else None
                positions.append(position)

    if remaining:
        raise ValueError("Semantic TAB events were not represented in MusicXML technical positions.")
    return positions


def create_read_view(root, side, original_bytes, directory):
    """Project part/staff/voice identities only; preserve every pitched note and tie marker."""
    existing = [note.get('id') for note in root.findall('.//note') if note.get('id') is not None]
    if any(not identifier for identifier in existing) or len(set(existing)) != len(existing):
        raise ValueError("Duplicate/empty note IDs are ambiguous.")
    used = set(existing)
    mapping = []
    for part in root.findall('part'):
        for measure_index, measure in enumerate(part.findall('measure')):
            for note_index, note in enumerate(measure.findall('note')):
                original_id = note.get('id')
                identifier = original_id
                if identifier is None:
                    identifier = f'gtab10c-{side}-{len(mapping)}'
                    if identifier in used:
                        raise ValueError("Generated note ID collides with an original ID.")
                    note.set('id', identifier)
                    used.add(identifier)
                if note.find('pitch') is not None and any(not (note.findtext(field) or '').strip() for field in ['voice', 'staff']):
                    raise ValueError("Unsupported missing voice/staff oracle context.")
                original_voice = int(note.findtext('voice') or '1')
                original_staff = int(note.findtext('staff') or '1')

                mapping.append({"originalVoice": original_voice, "originalStaff": original_staff,
                    "readViewVoice": original_voice, "tieStop": note_tie_flags(note)[0], "tieStart": note_tie_flags(note)[1],
                    "partId": part.get('id'), "measureIndex": measure_index,
                    "noteIndex": note_index, "isPitched": note.find('pitch') is not None, "originalId": original_id, "readViewId": identifier})
    part_mapping = []
    part_list = root.find('part-list')
    if part_list is None:
        raise ValueError("Missing part-list coverage.")
    original_parts = list(root.findall('part'))
    original_declarations = {node.get('id'): node for node in part_list.findall('score-part')}
    for node in list(part_list):
        part_list.remove(node)
    for part_index, part in enumerate(original_parts):
        root.remove(part)
        lanes = sorted({(int(note.findtext('staff') or '1'), int(note.findtext('voice') or '1')) for note in part.findall('.//note')})
        if not lanes or part.get('id') not in original_declarations:
            raise ValueError("Missing/ambiguous part lane inventory.")
        for lane_index, lane in enumerate(lanes):
            read_part_id = f'gtab10c-{side}-part-{part_index}-lane-{lane_index}'
            projected = deepcopy(part)
            projected.set('id', read_part_id)
            declaration = deepcopy(original_declarations[part.get('id')])
            declaration.set('id', read_part_id)
            part_list.append(declaration)
            for measure in projected.findall('measure'):
                for note in list(measure.findall('note')):
                    note_lane = (int(note.findtext('staff') or '1'), int(note.findtext('voice') or '1'))
                    if note_lane != lane:
                        offset = list(measure).index(note)
                        measure.remove(note)
                        if note.find('chord') is None:
                            duration = note.find('duration')
                            if duration is None:
                                raise ValueError("Unsupported lane projection without duration.")
                            forward = Element('forward')
                            forward.append(deepcopy(duration))
                            measure.insert(offset, forward)
                    else:
                        row = next(row for row in mapping if row['readViewId'] == note.get('id'))
                        row['readViewPartId'] = read_part_id
            root.append(projected)
            part_mapping.append({"originalPartId": part.get('id'), "readViewPartId": read_part_id,
                "originalStaff": lane[0], "originalVoice": lane[1]})
    raw = tostring(root, encoding='utf-8', xml_declaration=True)
    view = Path(directory) / f'{side}.musicxml'
    view.write_bytes(raw)
    return view, {"policy": "gtab10c-note-id-part-lane-read-view-v3", "originalSha256": hashlib.sha256(original_bytes).hexdigest(),
        "readViewSha256": hashlib.sha256(raw).hexdigest(), "mapping": mapping, "partMapping": part_mapping}


def restore_original_identity(snapshot, evidence, positions=None):
    mapping = {row['readViewId']: row for row in evidence['mapping']}
    notes = snapshot.get('notes')
    if not isinstance(notes, list):
        raise ValueError("Missing oracle note coverage.")
    seen = set()
    for note in notes:
        if note.get('source_id') in seen:
            raise ValueError("Duplicate projected note identity.")
        seen.add(note.get('source_id'))
        row = mapping.get(note.get('source_id'))
        if row is None or note.get('part_id') != row['readViewPartId'] or note.get('staff') != row['originalStaff'] or note.get('voice') != row['readViewVoice']:
            raise ValueError("Read-view identity cannot be restored uniquely.")
        if bool(note.get('tie_prev')) != row['tieStop'] or bool(note.get('tie_next')) != row['tieStart']:
            raise ValueError("Pinned oracle tie graph does not cover original XML tie markers.")
        note['voice'] = row['originalVoice']
        note['part_id'] = row['partId']
    if seen != {row['readViewId'] for row in evidence['mapping'] if row.get('isPitched')} :
        raise ValueError("Incomplete pitched-event oracle coverage.")
    part_mapping = {row['readViewPartId']: row['originalPartId'] for row in evidence['partMapping']}
    for field in ['time_signatures', 'key_signatures', 'clefs']:
        rows = snapshot.get(field)
        if not isinstance(rows, list):
            raise ValueError("Missing context coverage in projected snapshot.")
        restored = []
        for row in rows:
            if row.get('part_id') not in part_mapping:
                raise ValueError("Unbound projected context identity.")
            row['part_id'] = part_mapping[row['part_id']]
            if row not in restored:
                restored.append(row)
        snapshot[field] = restored
    snapshot['part_count'] = len(set(part_mapping.values()))
    if positions is not None:
        for position in positions:
            row = mapping.get(position.get('source_id'))
            if row is None or position.get('voice') != row['readViewVoice']:
                raise ValueError("TAB identity cannot be restored uniquely.")
            position['voice'] = row['originalVoice']


def verify_original_bytes(path, original):
    if read_fixture(path) != original:
        raise ValueError("Original MusicXML bytes changed during oracle execution.")


def key_staff_coverage(root):
    # Original XML identity evidence only: the pinned v1 oracle has no key staff field.
    rows = []
    for part in root.findall('part'):
        numbers = [key.get('number') for key in part.findall('measure/attributes/key')]
        rows.append({"partId": part.get('id'), "rawKeyStaffNumbers": numbers,
            "staffSpecific": any(number is not None for number in numbers)})
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("derived", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.source = qualified_path(args.source)
    args.derived = qualified_path(args.derived)
    args.output = qualified_path(args.output, output=True)
    if args.output in (args.source, args.derived) or (args.output.exists() and any(args.output.samefile(path) for path in (args.source, args.derived))):
        raise ValueError("Oracle output cannot overwrite an input fixture.")
    source_bytes = read_fixture(args.source)
    derived_bytes = read_fixture(args.derived)
    source_root = safe_root(args.source, source_bytes)
    derived_root = safe_root(args.derived, derived_bytes)
    def inventory(root):
        parts = [{"partId": part.get("id"), "measureCount": len(part.findall("measure"))} for part in root.findall("part")]
        if not parts or any(not row["partId"] for row in parts) or len({row["partId"] for row in parts}) != len(parts):
            raise ValueError("Missing/ambiguous part inventory.")
        return parts
    key_coverage = {"schema": "gtab10c-key-staff-coverage-v1",
        "source": key_staff_coverage(source_root), "derived": key_staff_coverage(derived_root)}
    source_parts = inventory(source_root)
    derived_parts = inventory(derived_root)
    # Temporary read views add IDs and separate identity lanes into parts.
    # Each pitched note/tie marker appears exactly once. Original source/export
    # bytes are immutable; snapshots are explicitly labeled read-view output.
    with tempfile.TemporaryDirectory(prefix="gtab10c-oracle-") as directory:
        source_view, source_normalization = create_read_view(source_root, 'source', source_bytes, directory)
        derived_view, derived_normalization = create_read_view(derived_root, 'derived', derived_bytes, directory)
        views = [source_view, derived_view]
        source_snapshot = snapshot_to_dict(load_musicxml_snapshot(views[0]))
        derived_snapshot = snapshot_to_dict(load_musicxml_snapshot(views[1]))
        positions = tab_positions(views[1], derived_snapshot)
        read_view_source_snapshot = deepcopy(source_snapshot)
        read_view_derived_snapshot = deepcopy(derived_snapshot)
        # Only reversible identity projection: never create or alter a tie edge.
        restore_original_identity(source_snapshot, source_normalization)
        restore_original_identity(derived_snapshot, derived_normalization, positions)
        payload = {
            "schema": "gtab-10c-semantic-oracle-output-v1",
            "readViewSourceSnapshot": read_view_source_snapshot,
            "readViewDerivedSnapshot": read_view_derived_snapshot,
            "sourceSnapshot": source_snapshot,
            "derivedSnapshot": derived_snapshot,
            "tabPositions": positions,
            "sourceSha256": hashlib.sha256(source_bytes).hexdigest(),
            "derivedSha256": hashlib.sha256(derived_bytes).hexdigest(),
            "keySignatureCoverage": key_coverage,
            "sourceParts": source_parts,
            "derivedParts": derived_parts,
            "partituraVersion": importlib.metadata.version("partitura"),
            "readViews": {"source": source_normalization, "derived": derived_normalization},
        }
    verify_original_bytes(args.source, source_bytes)
    verify_original_bytes(args.derived, derived_bytes)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
