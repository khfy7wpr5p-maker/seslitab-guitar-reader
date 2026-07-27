// AudiverisProvider — TODO stubs for future real OMR integration.
//
// Audiveris is an open-source OMR engine. This provider will eventually wrap
// either:
//   - a local Audiveris CLI invocation via a backend endpoint, or
//   - a hosted Audiveris service.
//
// None of the methods are implemented yet. Each returns a "not implemented"
// error so the pipeline fails gracefully if this provider is activated
// before it's ready. To activate, set OMR_PROVIDER=audiveris in .env.

import { assertProvider } from './IOmrProvider.js'

const audiverisProvider = {
  /**
   * TODO: Upload the PDF to the Audiveris backend and register a job.
   *
   * Planned flow:
   *   1. POST the PDF to the Audiveris service endpoint.
   *   2. Receive a job id.
   *   3. Return { success: true, jobId }.
   *
   * @param {File} _pdfFile
   * @returns {Promise<{ success: boolean, jobId?: string, error?: string }>}
   */
  async uploadPdf(_pdfFile) {
    // TODO: implement real Audiveris upload.
    return { success: false, error: 'Audiveris provider henüz uygulanmadı.' }
  },

  /**
   * TODO: Start OMR recognition for an uploaded job.
   *
   * Planned flow:
   *   1. POST to the Audiveris service to begin recognition.
   *   2. Return { success: true, jobId, status: 'processing' }.
   *
   * @param {string} _jobId
   * @returns {Promise<{ success: boolean, jobId?: string, status?: string, error?: string }>}
   */
  async analyzePdf(_jobId) {
    // TODO: implement real Audiveris recognition kickoff.
    return { success: false, error: 'Audiveris provider henüz uygulanmadı.' }
  },

  /**
   * TODO: Poll the Audiveris job status.
   *
   * Planned flow:
   *   1. GET the status from the Audiveris service for the given job id.
   *   2. Map the Audiveris status to our common vocabulary:
   *        'uploaded' | 'processing' | 'converting' | 'completed' | 'failed'
   *   3. Return { success: true, status }.
   *
   * @param {string} _jobId
   * @returns {Promise<{ success: boolean, status?: string, error?: string }>}
   */
  async getStatus(_jobId) {
    // TODO: implement real Audiveris status polling.
    return { success: false, error: 'Audiveris provider henüz uygulanmadı.' }
  },

  /**
   * TODO: Download the finished MusicXML from the Audiveris job.
   *
   * Planned flow:
   *   1. GET the MusicXML output from the Audiveris service.
   *   2. Return { success: true, musicXml }.
   *
   * @param {string} _jobId
   * @returns {Promise<{ success: boolean, musicXml?: string, error?: string }>}
   */
  async downloadMusicXML(_jobId) {
    // TODO: implement real Audiveris MusicXML download.
    return { success: false, error: 'Audiveris provider henüz uygulanmadı.' }
  },
}

assertProvider(audiverisProvider, 'audiverisProvider')

export default audiverisProvider
