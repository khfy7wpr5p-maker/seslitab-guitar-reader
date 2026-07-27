// AudiverisProvider — TODO stub for future real OMR integration.

import { assertProvider } from './IOmrProvider.js'

const audiverisProvider = {
  async uploadPdf(_pdfFile) {
    return { success: false, error: 'Audiveris provider henüz uygulanmadı.' }
  },
  async analyzePdf(_jobId) {
    return { success: false, error: 'Audiveris provider henüz uygulanmadı.' }
  },
  async getStatus(_jobId) {
    return { success: false, error: 'Audiveris provider henüz uygulanmadı.' }
  },
  async downloadMusicXML(_jobId) {
    return { success: false, error: 'Audiveris provider henüz uygulanmadı.' }
  },
}

assertProvider(audiverisProvider, 'audiverisProvider')

export default audiverisProvider
