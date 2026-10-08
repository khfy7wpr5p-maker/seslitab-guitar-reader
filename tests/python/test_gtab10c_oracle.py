import importlib.util
from pathlib import Path
import tempfile
import hashlib
import json
import subprocess
import sys
from unittest.mock import patch
import unittest

spec = importlib.util.spec_from_file_location('oracle', Path(__file__).resolve().parents[2] / 'scripts/gtab10cSemanticOracle.py')
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)

class OracleBoundaryTest(unittest.TestCase):
    def test_utf16_entity_is_rejected_before_any_oracle_load(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'attack.xml'
            path.write_bytes('<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE score-partwise [<!ENTITY injected "MARKER">]><score-partwise>&injected;</score-partwise>'.encode('utf-16'))
            with self.assertRaises(ValueError):
                oracle.safe_root(path)

    def test_microtonal_pitch_is_not_rounded_to_an_integer(self):
        note = oracle.ET.fromstring('<note><pitch><step>F</step><alter>0.5</alter><octave>4</octave></pitch></note>')
        with self.assertRaises(ValueError):
            oracle.midi_pitch(note)


    def test_read_view_preserves_ids_and_tie_elements_and_binds_exact_bytes(self):
        raw = b'<score-partwise><part-list><score-part id="P1"><part-name>test</part-name></score-part></part-list><part id="P1"><measure><note id="original"><tie type="start"/><notations><tied type="start"/></notations></note><note><tie type="stop"/></note></measure></part></score-partwise>'
        root = oracle.safe_root(Path('unused'), raw)
        with tempfile.TemporaryDirectory() as directory:
            view, evidence = oracle.create_read_view(root, 'source', raw, directory)
            actual = view.read_bytes()
            parsed = oracle.safe_root(view)
            self.assertEqual(parsed.findall('.//note')[0].get('id'), 'original')
            self.assertEqual(parsed.findall('.//note')[1].get('id'), 'gtab10c-source-1')
            self.assertEqual([oracle.note_tie_flags(note) for note in parsed.findall('.//note')], [(False, True), (True, False)])
            self.assertEqual(evidence['originalSha256'], hashlib.sha256(raw).hexdigest())
            self.assertEqual(evidence['readViewSha256'], hashlib.sha256(actual).hexdigest())
            self.assertEqual(evidence['mapping'][0]['originalId'], 'original')
            self.assertIsNone(evidence['mapping'][1]['originalId'])

    def test_duplicate_empty_and_generated_id_collisions_are_rejected(self):
        for notes in ['<note id="same"/><note id="same"/>', '<note id=""/>', '<note/><note id="gtab10c-source-0"/>']:
            root = oracle.safe_root(Path('unused'), f'<score-partwise><part-list><score-part id="P1"><part-name>test</part-name></score-part></part-list><part id="P1"><measure>{notes}</measure></part></score-partwise>'.encode())
            with tempfile.TemporaryDirectory() as directory, self.assertRaises(ValueError):
                oracle.create_read_view(root, 'source', b'original', directory)

    def test_original_mutation_is_detected_before_output(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'source.xml'
            path.write_bytes(b'original')
            oracle.verify_original_bytes(path, b'original')
            path.write_bytes(b'mutated')
            with self.assertRaises(ValueError):
                oracle.verify_original_bytes(path, b'original')

    def test_xml_boundaries_are_rejected(self):
        for raw in [b'', b'<broken', b'<score-timewise/>', b'<!DOCTYPE score-partwise><score-partwise/>', b'x' * (oracle.MAX_XML_BYTES + 1)]:
            with self.assertRaises(ValueError):
                oracle.safe_root(Path('unused'), raw)

    def test_integer_accidentals_and_nonfinite_alters(self):
        for alter, expected in [('1', 66), ('0', 65), ('-1', 64)]:
            note = oracle.ET.fromstring(f'<note><pitch><step>F</step><alter>{alter}</alter><octave>4</octave></pitch></note>')
            self.assertEqual(oracle.midi_pitch(note), expected)
        for alter in ['NaN', 'Infinity', '-Infinity']:
            note = oracle.ET.fromstring(f'<note><pitch><step>F</step><alter>{alter}</alter><octave>4</octave></pitch></note>')
            with self.assertRaises(ValueError):
                oracle.midi_pitch(note)

    def test_actual_pinned_oracle_output_retains_original_bytes_and_normalization_evidence(self):
        project = Path(__file__).resolve().parents[2]
        source = project / 'tests/fixtures/gtab10c/audiveris-like-source.musicxml'
        derived = project / 'artifacts/gtab10c-semantic-parity/derived/audiveris-like-single-part.musicxml'
        # The real pinned export is produced by the integration command, not a mock fixture.
        self.assertTrue(derived.exists(), 'Run pinned Editor integration before Python integration tests.')
        original = (source.read_bytes(), derived.read_bytes())
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'snapshot.json'
            subprocess.run([sys.executable, str(project / 'scripts/gtab10cSemanticOracle.py'), str(source), str(derived), str(output)], check=True)
            payload = json.loads(output.read_text())
            self.assertEqual(payload['partituraVersion'], '1.9.0')
            for side, raw in zip(['source', 'derived'], original):
                self.assertEqual(payload['readViews'][side]['policy'], 'gtab10c-note-id-part-lane-read-view-v3')
                self.assertEqual(payload['readViews'][side]['originalSha256'], hashlib.sha256(raw).hexdigest())
                self.assertTrue(payload['readViews'][side]['mapping'])
            self.assertEqual((source.read_bytes(), derived.read_bytes()), original)


    def test_actual_cli_rejects_ambiguous_and_incomplete_xml(self):
        project = Path(__file__).resolve().parents[2]
        source = project / 'tests/fixtures/gtab10c/audiveris-like-source.musicxml'
        original = (project / 'artifacts/gtab10c-semantic-parity/derived/audiveris-like-single-part.musicxml').read_bytes()
        mutations = [
            lambda root: root.findall('part')[0].set('id', ''),
            lambda root: root.findall('.//note')[0].set('id', ''),
            lambda root: root.findall('.//note')[0].remove(root.findall('.//note')[0].find('duration')),
            lambda root: root.findall('.//divisions')[0].__setattr__('text', '0'),
            lambda root: root.findall('.//backup/duration')[0].__setattr__('text', '99999'),
            lambda root: root.findall('.//note')[0].append(oracle.Element('tie', {'type': 'start'})),
        ]
        for mutate in mutations:
            with self.subTest(mutate=mutate), tempfile.TemporaryDirectory() as directory:
                derived = Path(directory) / 'derived.xml'
                output = Path(directory) / 'out.json'
                root = oracle.safe_root(Path('unused'), original)
                mutate(root)
                derived.write_bytes(oracle.tostring(root))
                with patch.object(sys, 'argv', ['oracle', str(source), str(derived), str(output)]), self.assertRaises((ValueError, KeyError)):
                    oracle.main()
                self.assertFalse(output.exists(), 'Failure must not publish a trusted snapshot.')

    def test_restored_identity_rejects_foreign_or_missing_coverage(self):
        row = {'readViewId': 'n', 'partId': 'original', 'readViewPartId': 'view', 'originalStaff': 1,
            'originalVoice': 3, 'readViewVoice': 3, 'tieStop': False, 'tieStart': False}
        evidence = {'mapping': [row], 'partMapping': [{'readViewPartId': 'view', 'originalPartId': 'original'}]}
        for snapshot in [{'notes': None}, {'notes': [{'source_id': 'foreign'}]},
            {'notes': [{'source_id': 'n', 'part_id': 'view', 'staff': 1, 'voice': 3}], 'time_signatures': None}]:
            with self.assertRaises(ValueError):
                oracle.restore_original_identity(snapshot, evidence)

if __name__ == '__main__':
    unittest.main()
