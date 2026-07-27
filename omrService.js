// Backwards-compatible re-export.
// The real implementation now lives in ./services/omrService.js, which in turn
// delegates to the provider layer in ./providers/. The active provider is
// selected by the VITE_OMR_PROVIDER env var (see .env).
export {
  sendPdfToOmr,
  uploadPdf,
  convertPdfToMusicXML,
  getConversionStatus,
  downloadMusicXML,
  getOmrProviderName,
  listOmrProviders,
} from './services/omrService.js'
