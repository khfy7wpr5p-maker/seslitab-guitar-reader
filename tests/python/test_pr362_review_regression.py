import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    'oracle_pr362',
    Path(__file__).resolve().parents[2] / 'scripts/gtab10cSemanticOracle.py',
)
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)


class Pr362ReviewRegressionTest(unittest.TestCase):
    def test_tab_staff_identity_ignores_preserved_source_technical_fingering(self):
        source = oracle.safe_root(Path('unused'), b'''<score-partwise>
          <part id="P1"><measure number="1"><attributes><staves>1</staves></attributes>
          <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff>
            <notations><technical><string>1</string><fret>5</fret></technical></notations>
          </note></measure></part>
          <part id="P2"><measure number="1"><attributes><staves>1</staves></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff>
            <notations><technical><string>2</string><fret>1</fret></technical></notations>
          </note></measure></part>
        </score-partwise>''')
        derived = oracle.safe_root(Path('unused'), b'''<score-partwise>
          <part id="P1"><measure number="1"><attributes>
            <staves>2</staves>
            <clef number="1"><sign>G</sign><line>2</line></clef>
            <clef number="2"><sign>TAB</sign><line>5</line></clef>
            <staff-details number="2"><staff-lines>6</staff-lines></staff-details>
          </attributes>
          <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff>
            <notations><technical><string>1</string><fret>5</fret></technical></notations>
          </note>
          <backup><duration>1</duration></backup>
          <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>5</voice><staff>2</staff>
            <notations><technical><string>3</string><fret>2</fret></technical></notations>
          </note></measure></part>
          <part id="P2"><measure number="1"><attributes><staves>1</staves></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff>
            <notations><technical><string>2</string><fret>1</fret></technical></notations>
          </note></measure></part>
        </score-partwise>''')
        self.assertEqual(oracle.resolve_tab_staff_identity(source, derived), ('P1', 2))

    def test_tab_staff_identity_fails_closed_when_multiple_parts_gain_tab_staffs(self):
        source = oracle.safe_root(Path('unused'), b'''<score-partwise>
          <part id="P1"><measure><attributes><staves>1</staves></attributes></measure></part>
          <part id="P2"><measure><attributes><staves>1</staves></attributes></measure></part>
        </score-partwise>''')
        derived = oracle.safe_root(Path('unused'), b'''<score-partwise>
          <part id="P1"><measure><attributes><staves>2</staves><clef number="2"><sign>TAB</sign></clef><staff-details number="2"/></attributes></measure></part>
          <part id="P2"><measure><attributes><staves>2</staves><clef number="2"><sign>TAB</sign></clef><staff-details number="2"/></attributes></measure></part>
        </score-partwise>''')
        with self.assertRaises(ValueError):
            oracle.resolve_tab_staff_identity(source, derived)


if __name__ == '__main__':
    unittest.main()
