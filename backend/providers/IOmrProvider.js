// IOmrProvider — common interface for backend OMR providers.

export const IOmrProvider = {
  async uploadPdf(pdfBuffer, fileName) {},
  async analyzePdf(providerJobId) {},
  async getStatus(providerJobId) {},
  async downloadMusicXML(providerJobId) {},
}

export function assertProvider(provider, name) {
  for (const method of ['uploadPdf', 'analyzePdf', 'getStatus', 'downloadMusicXML']) {
    if (typeof provider[method] !== 'function') {
      throw new Error(`Provider "${name}" missing ${method}()`)
    }
  }
}
