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
        with tempfile.TemporaryDirectory(prefix='gtab10c-test-') as root:
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
        with tempfile.TemporaryDirectory(prefix='gtab10c-test-') as directory:
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
            with tempfile.TemporaryDirectory(prefix='gtab10c-test-') as directory, self.assertRaises(ValueError):
                oracle.create_read_view(root, 'source', b'original', directory)

    def test_original_mutation_is_detected_before_output(self):
        with tempfile.TemporaryDirectory(prefix='gtab10c-test-') as directory:
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
        with tempfile.TemporaryDirectory(prefix='gtab10c-test-') as directory:
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
            with self.subTest(mutate=mutate), tempfile.TemporaryDirectory(prefix='gtab10c-test-') as directory:
                derived = Path(directory) / 'derived.xml'
                output = Path(directory) / 'out.json'
                root = oracle.safe_root(Path('unused'), original)
                mutate(root)
                derived.write_bytes(oracle.tostring(root))
                with patch.object(sys, 'argv', ['oracle', str(source), str(derived), str(output)]), self.assertRaises((ValueError, KeyError)):
                    oracle.main()
                self.assertFalse(output.exists(), 'Failure must not publish a trusted snapshot.')

    def test_actual_cli_rejects_duplicate_or_conflicting_tab_technical_metadata(self):
        project = Path(__file__).resolve().parents[2]
        source = project / 'tests/fixtures/gtab10c/audiveris-like-source.musicxml'
        original = (project / 'artifacts/gtab10c-semantic-parity/derived/audiveris-like-single-part.musicxml').read_bytes()
        accepted = []
        for kind in ['technical', 'notations', 'string', 'fret']:
            with tempfile.TemporaryDirectory(prefix='gtab10c-test-') as directory:
                derived = Path(directory) / 'derived.xml'
                output = Path(directory) / 'out.json'
                root = oracle.safe_root(Path('unused'), original)
                note = next(note for note in root.findall('.//note') if note.findtext('staff') == '2')
                notations = note.find('notations')
                technical = notations.find('technical')
                if kind == 'technical':
                    notations.append(oracle.deepcopy(technical))
                elif kind == 'notations':
                    note.append(oracle.deepcopy(notations))
                else:
                    duplicate = oracle.deepcopy(technical.find(kind))
                    duplicate.text = '6' if kind == 'string' else '19'
                    technical.append(duplicate)
                raw = oracle.tostring(root)
                derived.write_bytes(raw)
                try:
                    with patch.object(sys, 'argv', ['oracle', str(source), str(derived), str(output)]):
                        oracle.main()
                except ValueError as error:
                    self.assertIn('Ambiguous TAB technical', str(error))
                    self.assertFalse(output.exists())
                else:
                    accepted.append(kind)
                self.assertEqual(derived.read_bytes(), raw)
        self.assertEqual(accepted, [])

    def test_restored_identity_rejects_foreign_or_missing_coverage(self):
        row = {'readViewId': 'n', 'partId': 'original', 'readViewPartId': 'view', 'originalStaff': 1,
            'originalVoice': 3, 'readViewVoice': 3, 'tieStop': False, 'tieStart': False}
        evidence = {'mapping': [row], 'partMapping': [{'readViewPartId': 'view', 'originalPartId': 'original'}]}
        for snapshot in [{'notes': None}, {'notes': [{'source_id': 'foreign'}]},
            {'notes': [{'source_id': 'n', 'part_id': 'view', 'staff': 1, 'voice': 3}], 'time_signatures': None}]:
            with self.assertRaises(ValueError):
                oracle.restore_original_identity(snapshot, evidence)

class OraclePathBoundaryTest(unittest.TestCase):
    def test_escape_absolute_symlink_and_output_targets_are_rejected(self):
        for path in [Path('/etc/passwd'), oracle.ARTIFACT_ROOT / '../../../etc/passwd']:
            with self.assertRaises(ValueError):
                oracle.qualified_path(path)
        with tempfile.TemporaryDirectory(prefix='gtab10c-test-') as directory:
            link = Path(directory) / 'escape.xml'
            link.symlink_to('/etc/passwd')
            with self.assertRaises(ValueError):
                oracle.safe_root(link)
            with self.assertRaises(ValueError):
                oracle.qualified_path(Path(directory) / 'source.xml', output=True)
            self.assertEqual(oracle.qualified_path(Path(directory) / 'result.json', output=True),
                Path(directory) / 'result.json')

    def test_missing_pitched_voice_or_staff_is_rejected_before_projection(self):
        for missing in ['voice', 'staff']:
            raw = b'<score-partwise><part-list><score-part id="P1"><part-name>test</part-name></score-part></part-list><part id="P1"><measure><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note></measure></part></score-partwise>'
            root = oracle.safe_root(Path('unused'), raw)
            note = root.find('.//note')
            note.remove(note.find(missing))
            with tempfile.TemporaryDirectory(prefix='gtab10c-test-') as directory, self.assertRaises(ValueError):
                oracle.create_read_view(root, 'source', raw, directory)

    def test_missing_voice_or_staff_is_controlled_unsupported_before_pinned_load(self):
        project = Path(__file__).resolve().parents[2]
        source = project / 'tests/fixtures/gtab10c/audiveris-like-source.musicxml'
        original = (project / 'artifacts/gtab10c-semantic-parity/derived/audiveris-like-single-part.musicxml').read_bytes()
        for field in ['voice', 'staff']:
            with self.subTest(field=field), tempfile.TemporaryDirectory(prefix="gtab10c-test-") as directory:
                root = oracle.safe_root(Path('unused'), original)
                note = root.findall('.//note')[0]
                note.remove(note.find(field))
                derived = Path(directory) / 'derived.xml'
                output = Path(directory) / 'out.json'
                derived.write_bytes(oracle.tostring(root))
                with patch.object(sys, 'argv', ['oracle', str(source), str(derived), str(output)]), self.assertRaisesRegex(ValueError, 'Unsupported missing voice/staff oracle context'):
                    oracle.main()
                self.assertFalse(output.exists())
                self.assertEqual(derived.read_bytes(), oracle.tostring(root))


    def test_output_hardlink_cannot_overwrite_source_bytes(self):
        project = Path(__file__).resolve().parents[2]
        original = (project / 'tests/fixtures/gtab10c/audiveris-like-source.musicxml').read_bytes()
        derived_bytes = (project / 'artifacts/gtab10c-semantic-parity/derived/audiveris-like-single-part.musicxml').read_bytes()
        with tempfile.TemporaryDirectory(prefix='gtab10c-test-') as directory:
            source = Path(directory) / 'source.json'
            derived = Path(directory) / 'derived.xml'
            output = Path(directory) / 'output.json'
            source.write_bytes(original)
            derived.write_bytes(derived_bytes)
            output.hardlink_to(source)
            with patch.object(sys, 'argv', ['oracle', str(source), str(derived), str(output)]), self.assertRaisesRegex(ValueError, 'overwrite'):
                oracle.main()
            self.assertEqual(source.read_bytes(), original)

    def test_prefix_alone_does_not_authorize_a_public_directory(self):
        with tempfile.TemporaryDirectory(prefix='gtab10c-test-') as directory:
            path = Path(directory) / 'fixture.xml'
            path.write_bytes(b'<score-partwise/>')
            Path(directory).chmod(0o777)
            with self.assertRaises(ValueError):
                oracle.read_fixture(path)
            with self.assertRaises(ValueError):
                oracle.qualified_path(Path(directory) / 'output.json', output=True)

    def test_oversized_input_is_rejected_before_read_or_parse(self):
        with tempfile.TemporaryDirectory(prefix='gtab10c-test-') as directory:
            path = Path(directory) / 'oversized.xml'
            with path.open('wb') as stream:
                stream.truncate(oracle.MAX_XML_BYTES + 1)
            with self.assertRaises(ValueError):
                oracle.read_fixture(path)


    def test_raw_key_staff_inventory_preserves_scope_without_inventing_oracle_staff(self):
        raw = b'<score-partwise><part id="Scoped"><measure><attributes><key number="1"><fifths>3</fifths></key><key number="2"><fifths>0</fifths></key></attributes></measure></part><part id="Global"><measure><attributes><key><fifths>0</fifths></key></attributes></measure></part><part id="Absent"><measure/></part></score-partwise>'
        root = oracle.safe_root(Path('unused'), raw)
        before = oracle.tostring(root)
        self.assertEqual(oracle.key_staff_coverage(root), [
            {'partId': 'Scoped', 'rawKeyStaffNumbers': ['1', '2'], 'staffSpecific': True},
            {'partId': 'Global', 'rawKeyStaffNumbers': [None], 'staffSpecific': False},
            {'partId': 'Absent', 'rawKeyStaffNumbers': [], 'staffSpecific': False}])
        self.assertEqual(oracle.tostring(root), before)

    def test_raw_time_staff_inventory_preserves_scope_without_inventing_oracle_staff(self):
        raw = b'<score-partwise><part id="Scoped"><measure><attributes><time number="1"><beats>3</beats><beat-type>4</beat-type></time><time number="2"><beats>4</beats><beat-type>4</beat-type></time></attributes></measure></part><part id="Global"><measure><attributes><time><beats>4</beats><beat-type>4</beat-type></time></attributes></measure></part><part id="Absent"><measure/></part></score-partwise>'
        root = oracle.safe_root(Path('unused'), raw)
        before = oracle.tostring(root)
        self.assertEqual(oracle.time_staff_coverage(root), [
            {'partId': 'Scoped', 'rawTimeStaffNumbers': ['1', '2'], 'staffSpecific': True},
            {'partId': 'Global', 'rawTimeStaffNumbers': [None], 'staffSpecific': False},
            {'partId': 'Absent', 'rawTimeStaffNumbers': [], 'staffSpecific': False}])
        self.assertEqual(oracle.tostring(root), before)

    def test_raw_tab_profile_keeps_conflicting_and_late_declarations_without_mutation(self):
        raw = b'<score-partwise><part id="P1"><measure><attributes><staves>2</staves><staff-details number="2"><staff-lines>6</staff-lines><staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning></staff-details></attributes><note/><attributes><staff-details number="2"><staff-lines>5</staff-lines></staff-details></attributes></measure></part></score-partwise>'
        root = oracle.safe_root(Path('unused'), raw)
        before = oracle.tostring(root)
        profile = oracle.derived_tab_profile(root)
        self.assertEqual(profile['schema'], 'gtab10c-derived-tab-profile-v1')
        rows = profile['parts'][0]['staffDetails']
        self.assertEqual(profile['parts'][0]['partId'], 'P1')
        self.assertEqual(profile['parts'][0]['staffCounts'], [{'measureIndex': 0, 'beforeEvents': True, 'values': ['2']}])
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]['staffLines'], ['6'])
        self.assertTrue(rows[0]['beforeEvents'])
        self.assertEqual(rows[0]['tunings'], [{'line': '1', 'steps': ['E'], 'alters': [], 'octaves': ['2']}])
        self.assertEqual(rows[1]['staffLines'], ['5'])
        self.assertFalse(rows[1]['beforeEvents'])
        self.assertEqual(oracle.tostring(root), before)

if __name__ == '__main__':
    unittest.main()
