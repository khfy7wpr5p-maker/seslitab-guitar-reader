// MockProvider — in-memory fake OMR engine for backend development.

import { assertProvider } from './IOmrProvider.js'

const SAMPLE_MUSICXML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>Mock Etude</work-title></work>
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><technical><string>3</string><fret>2</fret></technical></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><type>quarter</type><technical><string>2</string><fret>1</fret></technical></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type><technical><string>1</string><fret>0</fret></technical></note>
    </measure>
  </part>
</score-partwise>`

const jobs = new Map()
let counter = 0

const mockProvider = {
  async uploadPdf(pdfBuffer, fileName) {
    if (!pdfBuffer?.length) return { success: false, error: 'PDF boş.', retryable: false }
    const id = `mock_${Date.now()}_${++counter}`
    jobs.set(id, { status: 'uploaded', progress: 0, musicXml: null, fileName })
    return { success: true, providerJobId: id, status: 'uploaded' }
  },
  async analyzePdf(id) {
    const j = jobs.get(id)
    if (!j) return { success: false, error: 'İş bulunamadı.', retryable: false }
    j.status = 'processing'; j.progress = 10
    return { success: true, providerJobId: id, status: 'processing', progress: 10 }
  },
  async getStatus(id) {
    const j = jobs.get(id)
    if (!j) return { success: false, error: 'İş bulunamadı.', retryable: false }
    if ((j.status === 'processing' || j.status === 'converting') && j.progress < 100) {
      j.progress = Math.min(100, j.progress + 30)
      if (j.progress >= 50 && j.status === 'processing') j.status = 'converting'
      if (j.progress >= 100) { j.status = 'completed'; j.musicXml = SAMPLE_MUSICXML }
    }
    return { success: true, providerJobId: id, status: j.status, progress: j.progress }
  },
  async downloadMusicXML(id) {
    const j = jobs.get(id)
    if (!j || !j.musicXml) return { success: false, error: 'MusicXML hazır değil.', retryable: false }
    return { success: true, providerJobId: id, status: 'completed', musicXml: j.musicXml }
  },
}

assertProvider(mockProvider, 'mockProvider')
export default mockProvider
