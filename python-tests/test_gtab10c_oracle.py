import importlib.util
from pathlib import Path
import tempfile
import hashlib
import json
import subprocess
import sys
import unittest

spec = importlib.util.spec_from_file_location('oracle', Path(__file__).resolve().parents[1] / 'scripts/gtab10cSemanticOracle.py')
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
        raw = b'<score-partwise><part id="P1"><measure><note id="original"><tie type="start"/><notations><tied type="start"/></notations></note><note><tie type="stop"/></note></measure></part></score-partwise>'
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
            root = oracle.safe_root(Path('unused'), f'<score-partwise><part id="P1"><measure>{notes}</measure></part></score-partwise>'.encode())
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
        project = Path(__file__).resolve().parents[1]
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
                self.assertEqual(payload['readViews'][side]['policy'], 'gtab10c-note-id-read-view-v1')
                self.assertEqual(payload['readViews'][side]['originalSha256'], hashlib.sha256(raw).hexdigest())
                self.assertTrue(payload['readViews'][side]['mapping'])
            self.assertEqual((source.read_bytes(), derived.read_bytes()), original)

if __name__ == '__main__':
    unittest.main()
