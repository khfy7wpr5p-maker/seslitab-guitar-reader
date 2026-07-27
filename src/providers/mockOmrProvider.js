// MockProvider — in-browser fake OMR engine for development.
// Returns a small, valid MusicXML document immediately.

import { assertProvider } from './IOmrProvider.js'

const SAMPLE_MUSICXML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>Mock Etude</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <technical><string>3</string><fret>2</fret></technical>
      </note>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <technical><string>2</string><fret>1</fret></technical>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
        <technical><string>1</string><fret>0</fret></technical>
      </note>
    </measure>
  </part>
</score-partwise>`

const jobs = new Map()
let counter = 0

const mockOmrProvider = {
  async uploadPdf(pdfFile) {
    if (!pdfFile) return { success: false, error: 'PDF dosyası boş.' }
    const jobId = `mock_${Date.now()}_${++counter}`
    jobs.set(jobId, { status: 'uploaded', progress: 0, musicXml: null })
    return { success: true, jobId }
  },

  async analyzePdf(jobId) {
    const job = jobs.get(jobId)
    if (!job) return { success: false, error: 'İş bulunamadı.' }
    job.status = 'processing'
    job.progress = 10
    return { success: true, jobId, status: 'processing' }
  },

  async getStatus(jobId) {
    const job = jobs.get(jobId)
    if (!job) return { success: false, error: 'İş bulunamadı.' }
    if (job.status === 'processing' && job.progress < 100) {
      job.progress = Math.min(100, job.progress + 30)
      if (job.progress >= 100) {
        job.status = 'completed'
        job.musicXml = SAMPLE_MUSICXML
      }
    }
    return { success: true, status: job.status, progress: job.progress }
  },

  async downloadMusicXML(jobId) {
    const job = jobs.get(jobId)
    if (!job || !job.musicXml) return { success: false, error: 'MusicXML hazır değil.' }
    return { success: true, musicXml: job.musicXml }
  },
}

assertProvider(mockOmrProvider, 'mockOmrProvider')

export default mockOmrProvider
