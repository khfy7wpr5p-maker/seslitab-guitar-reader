// IOmrProvider — the common interface every OMR provider must implement.
//
// This is a JSDoc-based interface (JavaScript has no native interfaces).
// Each method's signature and return shape is the contract. Providers that
// violate the contract will break the pipeline at runtime, so any new
// provider must match these shapes exactly.
//
// The four-stage lifecycle:
//
//   1. uploadPdf(pdfFile)       → register the PDF, get a jobId
//   2. analyzePdf(jobId)        → kick off OMR recognition
//   3. getStatus(jobId)         → poll until status === 'completed'
//   4. downloadMusicXML(jobId)  → fetch the resulting MusicXML
//
// Status values: 'uploaded' | 'processing' | 'converting' | 'completed' | 'failed'

/**
 * @typedef {Object} OmrResult
 * @property {boolean} success
 * @property {string}  [jobId]
 * @property {string}  [status]    — one of the status values above
 * @property {string}  [musicXml]  — the MusicXML document (downloadMusicXML only)
 * @property {string}  [error]     — human-readable error message on failure
 */

/**
 * @interface IOmrProvider
 */
export const IOmrProvider = {
  /**
   * Stage 1 — accept a PDF file and register an OMR job.
   * @param {File} pdfFile
   * @returns {Promise<OmrResult>} { success, jobId? }
   */
  async uploadPdf(pdfFile) {},

  /**
   * Stage 2 — start OMR recognition for a previously uploaded job.
   * @param {string} jobId
   * @returns {Promise<OmrResult>} { success, jobId, status? }
   */
  async analyzePdf(jobId) {},

  /**
   * Stage 3 — poll the status of an OMR job.
   * @param {string} jobId
   * @returns {Promise<OmrResult>} { success, status? }
   */
  async getStatus(jobId) {},

  /**
   * Stage 4 — download the finished MusicXML for a completed job.
   * @param {string} jobId
   * @returns {Promise<OmrResult>} { success, musicXml? }
   */
  async downloadMusicXML(jobId) {},
}

/**
 * Validate that an object implements the IOmrProvider contract.
 * Throws if any required method is missing.
 * @param {Object} provider
 * @param {string} name — provider name for error messages
 */
export function assertProvider(provider, name) {
  const required = ['uploadPdf', 'analyzePdf', 'getStatus', 'downloadMusicXML']
  for (const method of required) {
    if (typeof provider[method] !== 'function') {
      throw new Error(`Provider "${name}" does not implement IOmrProvider: missing ${method}()`)
    }
  }
}
