// STI-11 — exact immutable product revision -> revalidated MusicXML registry.
//
// Deliberately separate from Package 7C raw-source provenance. Registering a
// corrected/product clone here never transfers OMR/source quality evidence.

export const PRD_PRODUCT_MUSICXML_PROVENANCE = 'editor-prd-revalidated-product-musicxml'
const records = new WeakMap()

function validContent(content) {
  return Array.isArray(content)
}

function validXml(musicXml) {
  return typeof musicXml === 'string' && musicXml.trim() !== ''
}

export function registerPrDProductMusicXml(revision, musicXml, {
  evidence = 'seslitab-structural-revalidation',
} = {}) {
  if (!revision || !validContent(revision.content) || typeof revision.revisionId !== 'string' || revision.revisionId.trim() === '') {
    throw new TypeError('PR-D product MusicXML registry requires an immutable product revision.')
  }
  if (!validXml(musicXml)) throw new TypeError('PR-D product MusicXML registry requires non-empty MusicXML.')
  if (typeof evidence !== 'string' || evidence.trim() === '') throw new TypeError('PR-D product MusicXML evidence label is required.')
  const record = Object.freeze({
    revisionId: revision.revisionId,
    content: revision.content,
    musicXml,
    provenance: PRD_PRODUCT_MUSICXML_PROVENANCE,
    evidence: evidence.trim(),
  })
  records.set(revision.content, record)
  return record
}

export function resolvePrDProductMusicXml(revision) {
  if (!revision || !validContent(revision.content)) return null
  const record = records.get(revision.content) ?? null
  if (!record || record.revisionId !== revision.revisionId || record.content !== revision.content) return null
  return record
}
