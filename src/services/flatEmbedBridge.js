// Flat Embed prototype boundary for teacher-side MusicXML editing.
//
// This adapter intentionally does not mutate SesliTab canonical state, revisions,
// OMR evidence, teacher approval or quality routing. It only proves the bounded
// round trip: current MusicXML -> Flat editor -> exported MusicXML.

export const FLAT_EMBED_CDN_URL = 'https://prod.flat-cdn.com/embed-js/v2.12.1/embed.min.js'
export const FLAT_EMBED_SCRIPT_ID = 'seslitab-flat-embed-sdk'

let sdkPromise = null

export function normalizeFlatMusicXmlExport(value) {
  if (typeof value === 'string') return value

  if (value instanceof Uint8Array) {
    return new TextDecoder('utf-8').decode(value)
  }

  if (value instanceof ArrayBuffer) {
    return new TextDecoder('utf-8').decode(new Uint8Array(value))
  }

  throw new TypeError('Flat MusicXML export format is unsupported.')
}

export function loadFlatEmbedSdk({ root = document, win = window, src = FLAT_EMBED_CDN_URL } = {}) {
  if (typeof win?.Flat?.Embed === 'function') return Promise.resolve(win.Flat.Embed)
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (typeof win?.Flat?.Embed === 'function') {
        resolve(win.Flat.Embed)
      } else {
        sdkPromise = null
        reject(new Error('Flat Embed SDK loaded without Flat.Embed.'))
      }
    }

    const fail = () => {
      sdkPromise = null
      reject(new Error('Flat Embed SDK could not be loaded.'))
    }

    const existing = root.getElementById?.(FLAT_EMBED_SCRIPT_ID)
    if (existing) {
      existing.addEventListener?.('load', finish, { once: true })
      existing.addEventListener?.('error', fail, { once: true })
      return
    }

    const script = root.createElement('script')
    script.id = FLAT_EMBED_SCRIPT_ID
    script.src = src
    script.async = true
    script.crossOrigin = 'anonymous'
    script.addEventListener('load', finish, { once: true })
    script.addEventListener('error', fail, { once: true })
    root.head?.appendChild(script)
  })

  return sdkPromise
}

export async function createFlatEmbedSession(container, { appId, EmbedCtor } = {}) {
  if (!container) throw new TypeError('Flat Embed container is required.')
  if (!String(appId || '').trim()) throw new Error('Flat Embed appId is required.')
  if (typeof EmbedCtor !== 'function') throw new TypeError('Flat Embed constructor is required.')

  const embed = new EmbedCtor(container, {
    embedParams: {
      appId: String(appId).trim(),
      mode: 'edit',
      controlsPosition: 'top',
    },
    width: '100%',
    height: '100%',
  })

  if (typeof embed.ready === 'function') await embed.ready()

  return Object.freeze({
    async loadMusicXml(xml) {
      const source = typeof xml === 'string' ? xml.trim() : ''
      if (!source) throw new TypeError('MusicXML source is required.')
      await embed.loadMusicXML(source)
    },

    async exportMusicXml() {
      const output = await embed.getMusicXML({ compressed: false })
      return normalizeFlatMusicXmlExport(output)
    },

    rawEmbed: embed,
  })
}
