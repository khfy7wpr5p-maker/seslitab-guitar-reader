// Audiveris Adapter — TODO stubs for future real OMR integration.
//
// Audiveris is an open-source OMR engine. This adapter will eventually wrap
// either:
//   - a local Audiveris CLI invocation via a backend endpoint, or
//   - a hosted Audiveris service.
//
// None of the methods are implemented yet. Each one is a placeholder that
// returns a "not implemented" error so the pipeline fails gracefully if
// this adapter is activated before it's ready.

const audiverisAdapter = {
  /**
   * TODO: Send the PDF to the Audiveris backend and start recognition.
   *
   * Planned flow:
   *   1. POST the PDF to the Audiveris service endpoint.
   *   2. Receive a job id.
   *   3. Return { success: true, jobId }.
   *
   * @param {File} _pdfFile
   * @returns {Promise<{ success: boolean, jobId?: string, error?: string }>}
   */
  async analyzePdf(_pdfFile) {
    // TODO: implement real Audiveris upload + conversion kickoff.
    return { success: false, error: 'Audiveris adapter henüz uygulanmadı.' }
  },

  /**
   * TODO: Poll the Audiveris job status.
   *
   * Planned flow:
   *   1. GET the status from the Audiveris service for the given job id.
   *   2. Map the Audiveris status to our common status vocabulary:
   *        'uploaded' | 'processing' | 'converting' | 'completed' | 'failed'
   *   3. Return { success: true, status }.
   *
   * @param {string} _jobId
   * @returns {Promise<{ success: boolean, status?: string, error?: string }>}
   */
  async getStatus(_jobId) {
    // TODO: implement real Audiveris status polling.
    return { success: false, error: 'Audiveris adapter henüz uygulanmadı.' }
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
    return { success: false, error: 'Audiveris adapter henüz uygulanmadı.' }
  },
}

export default audiverisAdapter
