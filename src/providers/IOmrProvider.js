// IOmrProvider — the common interface every OMR provider must implement.
//
// Four-stage lifecycle:
//   1. uploadPdf(pdfFile)       → register the PDF, get a jobId
//   2. analyzePdf(jobId)        → kick off OMR recognition
//   3. getStatus(jobId)          → poll until status === 'completed'
//   4. downloadMusicXML(jobId)   → fetch the resulting MusicXML

export const IOmrProvider = {
  async uploadPdf(pdfFile) {},
  async analyzePdf(jobId) {},
  async getStatus(jobId) {},
  async downloadMusicXML(jobId) {},
}

export function assertProvider(provider, name) {
  const required = ['uploadPdf', 'analyzePdf', 'getStatus', 'downloadMusicXML']
  for (const method of required) {
    if (typeof provider[method] !== 'function') {
      throw new Error(`Provider "${name}" does not implement IOmrProvider: missing ${method}()`)
    }
  }
}
