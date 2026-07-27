// MockOmrProvider — development-mode implementation of IOmrProvider.
//
// This provider returns canned MusicXML so the full pipeline works without a
// real OMR engine. It is the default provider. When a real engine is ready,
// set OMR_PROVIDER=audiveris (or another provider key) in .env and the
// factory in providers/index.js will switch automatically — no other code
// changes.
//
// DEVELOPMENT MODE — do not use in production. No real PDF analysis happens.

import { assertProvider } from './IOmrProvider.js'

// Reuse the rich 8-measure mock MusicXML from the mock adapter so there is a
// single source of truth for the demo data.
import mockOmrAdapter, { getDemoMusicXml } from '../adapters/mockOmrAdapter.js'

// In-memory job store for the mock provider.
const mockJobs = new Map()

function generateJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const mockOmrProvider = {
  /**
   * Stage 1 — register the PDF and create a job.
   * @param {File} pdfFile
   * @returns {Promise<{ success: boolean, jobId?: string, error?: string }>}
   */
  async uploadPdf(pdfFile) {
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
      return { success: true, jobId }
    } catch (err) {
      return { success: false, error: err.message || 'Mock yükleme hatası' }
    }
  },

  /**
   * Stage 2 — start OMR recognition. Walks through the processing stages
   * with delays and attaches the mock MusicXML on completion.
   * @param {string} jobId
   * @returns {Promise<{ success: boolean, jobId?: string, status?: string, error?: string }>}
   */
  async analyzePdf(jobId) {
    try {
      if (!jobId) {
        return { success: false, error: 'İş kimliği gerekli.' }
      }
      const job = mockJobs.get(jobId)
      if (!job) {
        return { success: false, error: 'Geçersiz iş kimliği.' }
      }

      job.status = 'processing'
      await delay(600)
      job.status = 'converting'
      await delay(800)
      job.status = 'completed'
      job.musicXml = getDemoMusicXml()

      return { success: true, jobId, status: job.status }
    } catch (err) {
      return { success: false, error: err.message || 'Mock analiz hatası' }
    }
  },

  /**
   * Stage 3 — poll job status.
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
   * Stage 4 — download the finished MusicXML.
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

assertProvider(mockOmrProvider, 'mockOmrProvider')

export default mockOmrProvider
