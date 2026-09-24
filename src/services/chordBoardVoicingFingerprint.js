import {
  canonicalChordBoardVoicingJson,
} from './chordBoardVoicingCanonical.js'

export async function fingerprintChordBoardVoicing(
  value,
  subtle = globalThis.crypto?.subtle,
) {
  if (!subtle || typeof subtle.digest !== 'function') {
    throw new Error('Web Crypto SHA-256 unavailable.')
  }

  const bytes = new TextEncoder().encode(
    canonicalChordBoardVoicingJson(value),
  )
  const digest = await subtle.digest('SHA-256', bytes)

  return [...new Uint8Array(digest)]
    .map((byte) =>
      byte.toString(16).padStart(2, '0'),
    )
    .join('')
}
