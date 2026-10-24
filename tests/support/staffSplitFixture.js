export const note = (step, staff, duration = 2, extra = '', voice = 1) =>
  '<note>' + extra + '<pitch><step>' + step + '</step><octave>4</octave></pitch><duration>' + duration + '</duration><voice>' + voice + '</voice><type>quarter</type><staff>' + staff + '</staff></note>'
export function score(body = note('E', 1) + note('F', 1) + '<backup><duration>4</duration></backup>' + note('C', 2) + note('G', 2, 2, '<chord/>') + note('D', 2), attrs = '') {
  return '<score-partwise version="4.0"><part-list><score-part id="P0"><part-name>Piano</part-name></score-part></part-list><part id="P0"><measure number="1"><attributes><divisions>2</divisions><time><beats>2</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>' + attrs + '</attributes>' + body + '</measure></part></score-partwise>'
}
