// OMR Adapter — common interface + dependency-injection registry.
//
// Every concrete adapter (mockOmrAdapter, audiverisAdapter, future
// scanScoreAdapter, smartScoreAdapter, playScoreAdapter, ...) implements
// the same three methods:
//
//   analyzePdf(pdfFile)        → starts conversion, returns { success, jobId? }
//   getStatus(jobId)           → polls status, returns { success, status? }
//                                status ∈ 'uploaded'|'processing'|'converting'|'completed'|'failed'
//   downloadMusicXML(jobId)    → fetches result, returns { success, musicXml? }
//
// The rest of the app NEVER imports a concrete adapter directly. It calls
// omrAdapter.analyzePdf(...) and the active adapter is resolved through the
// registry. Switching engines is a single setAdapter() call — no call-site
// changes anywhere else.

import mockOmrAdapter from './mockOmrAdapter.js'
import audiverisAdapter from './audiverisAdapter.js'

// Registry of available adapters, keyed by name.
// Add new engines here as they are implemented.
const registry = {
  mock: mockOmrAdapter,
  audiveris: audiverisAdapter,
  // scanScore: scanScoreAdapter,   // future
  // smartScore: smartScoreAdapter, // future
  // playScore: playScoreAdapter,   // future
}

// The currently active adapter. Defaults to the mock adapter so the demo
// pipeline works out of the box. Call setAdapter('audiveris') to switch.
let activeAdapter = registry.mock

/**
 * Switch the active OMR engine at runtime.
 * @param {string} name - adapter key in the registry ('mock', 'audiveris', ...)
 * @returns {boolean} true if the adapter was found and activated
 */
export function setAdapter(name) {
  const adapter = registry[name]
  if (!adapter) return false
  activeAdapter = adapter
  return true
}

/**
 * Get the key of the currently active adapter.
 * @returns {string}
 */
export function getAdapter() {
  return Object.keys(registry).find((k) => registry[k] === activeAdapter) || 'mock'
}

/**
 * List all registered adapter names.
 * @returns {string[]}
 */
export function listAdapters() {
  return Object.keys(registry)
}

// ---------------------------------------------------------------------------
// Public facade — delegates to the active adapter.
// Callers depend on this stable interface, never on a concrete adapter.
// ---------------------------------------------------------------------------

/**
 * Start OMR analysis for a PDF file.
 * @param {File} pdfFile
 * @returns {Promise<{ success: boolean, jobId?: string, error?: string }>}
 */
export async function analyzePdf(pdfFile) {
  return activeAdapter.analyzePdf(pdfFile)
}

/**
 * Poll the status of an OMR job.
 * @param {string} jobId
 * @returns {Promise<{ success: boolean, status?: string, error?: string }>}
 */
export async function getStatus(jobId) {
  return activeAdapter.getStatus(jobId)
}

/**
 * Download the finished MusicXML for a completed job.
 * @param {string} jobId
 * @returns {Promise<{ success: boolean, musicXml?: string, error?: string }>}
 */
export async function downloadMusicXML(jobId) {
  return activeAdapter.downloadMusicXML(jobId)
}
