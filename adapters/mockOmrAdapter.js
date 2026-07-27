// Mock OMR Adapter — DEVELOPMENT MODE demo implementation.
//
// DEVELOPMENT MODE — do not use in production. No real PDF analysis happens.
// Returns canned MusicXML so the full pipeline works without a real engine.
// This adapter is used by mockOmrProvider; switch to a real provider via the
// VITE_OMR_PROVIDER env var (see .env).

// A rich MusicXML document with 8 measures covering varied rhythms:
//   1 — quarter / quarter / half
//   2 — quarter / quarter / half (different pitches)
//   3 — quarter / quarter / half (reordered)
//   4 — eighth notes (4 eighths + 2 quarters)
//   5 — sixteenth notes (8 sixteenths + 2 quarters)
//   6 — dotted half + quarter
//   7 — whole rest
//   8 — closing measure: quarter / quarter / half
const MOCK_MUSICXML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1">
      <part-name>Guitar</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
        </time>
        <clef>
          <sign>TAB</sign>
          <line>5</line>
        </clef>
        <staff-details>
          <staff-lines>6</staff-lines>
          <staff-tuning line="1">
            <tuning-step>E</tuning-step>
            <tuning-octave>4</tuning-octave>
          </staff-tuning>
          <staff-tuning line="2">
            <tuning-step>B</tuning-step>
            <tuning-octave>3</tuning-octave>
          </staff-tuning>
          <staff-tuning line="3">
            <tuning-step>G</tuning-step>
            <tuning-octave>3</tuning-octave>
          </staff-tuning>
          <staff-tuning line="4">
            <tuning-step>D</tuning-step>
            <tuning-octave>3</tuning-octave>
          </staff-tuning>
          <staff-tuning line="5">
            <tuning-step>A</tuning-step>
            <tuning-octave>2</tuning-octave>
          </staff-tuning>
          <staff-tuning line="6">
            <tuning-step>E</tuning-step>
            <tuning-octave>2</tuning-octave>
          </staff-tuning>
        </staff-details>
      </attributes>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>3</string>
            <fret>2</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>2</string>
            <fret>1</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>2</duration>
        <voice>1</voice>
        <type>half</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>1</string>
            <fret>0</fret>
          </technical>
        </notations>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>2</string>
            <fret>3</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>2</string>
            <fret>1</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>2</duration>
        <voice>1</voice>
        <type>half</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>1</string>
            <fret>0</fret>
          </technical>
        </notations>
      </note>
    </measure>
    <measure number="3">
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>1</string>
            <fret>0</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>2</string>
            <fret>1</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>2</duration>
        <voice>1</voice>
        <type>half</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>3</string>
            <fret>2</fret>
          </technical>
        </notations>
      </note>
    </measure>
    <measure number="4">
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>0.5</duration>
        <voice>1</voice>
        <type>eighth</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>1</string>
            <fret>0</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>0.5</duration>
        <voice>1</voice>
        <type>eighth</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>3</string>
            <fret>2</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>0.5</duration>
        <voice>1</voice>
        <type>eighth</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>2</string>
            <fret>1</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>0.5</duration>
        <voice>1</voice>
        <type>eighth</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>2</string>
            <fret>3</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>2</string>
            <fret>1</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>1</string>
            <fret>0</fret>
          </technical>
        </notations>
      </note>
    </measure>
    <measure number="5">
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>0.25</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>1</string>
            <fret>0</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>0.25</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>3</string>
            <fret>2</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>0.25</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>2</string>
            <fret>1</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>0.25</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>2</string>
            <fret>3</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>0.25</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>2</string>
            <fret>1</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>0.25</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>3</string>
            <fret>2</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>0.25</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>1</string>
            <fret>0</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>0.25</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>3</string>
            <fret>2</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>2</string>
            <fret>1</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>1</string>
            <fret>0</fret>
          </technical>
        </notations>
      </note>
    </measure>
    <measure number="6">
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>3</duration>
        <voice>1</voice>
        <type>half</type>
        <dot/>
        <staff>1</staff>
        <notations>
          <technical>
            <string>3</string>
            <fret>2</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>1</string>
            <fret>0</fret>
          </technical>
        </notations>
      </note>
    </measure>
    <measure number="7">
      <note>
        <rest/>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
    <measure number="8">
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>3</string>
            <fret>2</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>2</string>
            <fret>1</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>2</duration>
        <voice>1</voice>
        <type>half</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>1</string>
            <fret>0</fret>
          </technical>
        </notations>
      </note>
    </measure>
  </part>
</score-partwise>`

// In-memory job store for the mock adapter.
const mockJobs = new Map()

function generateJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const mockOmrAdapter = {
  /**
   * Start OMR analysis for a PDF file.
   * Walks through uploaded → processing → converting → completed with delays.
   * @param {File} pdfFile
   * @returns {Promise<{ success: boolean, jobId?: string, error?: string }>}
   */
  async analyzePdf(pdfFile) {
    try {
      if (!pdfFile) {
        return { success: false, error: 'PDF dosyası bulunamadı.' }
      }
      await delay(400)
      const jobId = generateJobId()
      mockJobs.set(jobId, {
        id: jobId,
        fileName: pdfFile.name,
        status: 'uploaded',
        createdAt: Date.now(),
        musicXml: null,
      })
      // Simulate the processing stages.
      const job = mockJobs.get(jobId)
      job.status = 'processing'
      await delay(600)
      job.status = 'converting'
      await delay(800)
      job.status = 'completed'
      job.musicXml = MOCK_MUSICXML
      return { success: true, jobId }
    } catch (err) {
      return { success: false, error: err.message || 'Mock analiz hatası' }
    }
  },

  /**
   * Poll the status of a mock job.
   * @param {string} jobId
   * @returns {Promise<{ success: boolean, status?: string, error?: string }>}
   */
  async getStatus(jobId) {
    try {
      if (!jobId) return { success: false, error: 'İş kimliği gerekli.' }
      const job = mockJobs.get(jobId)
      if (!job) return { success: false, error: 'Geçersiz iş kimliği.' }
      return { success: true, status: job.status }
    } catch (err) {
      return { success: false, error: err.message || 'Durum sorgulama hatası' }
    }
  },

  /**
   * Download the finished MusicXML for a completed mock job.
   * @param {string} jobId
   * @returns {Promise<{ success: boolean, musicXml?: string, error?: string }>}
   */
  async downloadMusicXML(jobId) {
    try {
      if (!jobId) return { success: false, error: 'İş kimliği gerekli.' }
      const job = mockJobs.get(jobId)
      if (!job) return { success: false, error: 'Geçersiz iş kimliği.' }
      if (job.status !== 'completed' || !job.musicXml) {
        return { success: false, error: 'Dönüşüm henüz tamamlanmadı.' }
      }
      return { success: true, musicXml: job.musicXml }
    } catch (err) {
      return { success: false, error: err.message || 'MusicXML indirme hatası' }
    }
  },
}

export function getDemoMusicXml() {
  return MOCK_MUSICXML
}

export default mockOmrAdapter
