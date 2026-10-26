import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { restorePieceAssignment, restorePieceLifecycle } from './firestoreSecureDeliveryStore.js'

const MODES = new Set(['dry-run', 'apply', 'verify'])
const CURSOR = /^[A-Za-z0-9_-]{1,1500}$/u

export function validatePieceBackfillOptions({ mode, limit, after }) {
  if (!MODES.has(mode)) throw new TypeError('piece-backfill-mode-invalid')
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new TypeError('piece-backfill-limit-invalid')
  }
  if (after !== null && (typeof after !== 'string' || !CURSOR.test(after))) {
    throw new TypeError('piece-backfill-cursor-invalid')
  }
}

function invalid(code) {
  const error = new Error(code)
  error.backfillCode = code
  return error
}

function validatedPiece(pieceSnapshot) {
  if (!pieceSnapshot.exists) throw invalid('PIECE_DISAPPEARED')
  let piece
  const raw = pieceSnapshot.data()
  try {
    piece = restorePieceAssignment(raw)
  } catch {
    throw invalid('INVALID_PIECE')
  }
  if (Buffer.from(piece.pieceAssignmentId, 'utf8').toString('base64url') !== pieceSnapshot.id) {
    throw invalid('INVALID_PIECE_DOCUMENT_KEY')
  }
  return piece
}

function inspect(pieceSnapshot, lifecycleSnapshot) {
  const piece = validatedPiece(pieceSnapshot)
  const raw = pieceSnapshot.data()
  let lifecycle = null
  if (lifecycleSnapshot.exists) {
    try {
      lifecycle = restorePieceLifecycle(lifecycleSnapshot.data(), piece)
    } catch {
      throw invalid('INVALID_PIECE_LIFECYCLE')
    }
  }
  const eligible = lifecycle === null || lifecycle.revokedAt === null
  return {
    piece,
    eligible,
    missing: !Object.hasOwn(raw, 'studentListEligible'),
    needsUpdate: raw.studentListEligible !== eligible,
  }
}

// One bounded page per invocation. The caller must verify all pages from the
// beginning after applying; a resumed page alone never proves global coverage.
export async function backfillPieceEligibilityPage({
  firestore,
  mode = 'dry-run',
  limit = 50,
  after = null,
  applyAuthorized = false,
} = {}) {
  validatePieceBackfillOptions({ mode, limit, after })
  if (mode === 'apply' && applyAuthorized !== true) {
    throw new Error('piece-backfill-apply-not-authorized')
  }
  let query = firestore.collection('pieceAssignments').orderBy('__name__')
  if (after !== null) query = query.startAfter(after)
  const page = await query.limit(limit).get()
  const docs = page.docs
  const lifecycleRefs = docs.map((doc) => firestore.collection('pieceAssignmentLifecycle').doc(doc.id))
  let lifecycleSnapshots = []
  if (mode !== 'apply' && docs.length > 0) {
    lifecycleSnapshots = await firestore.getAll(...lifecycleRefs)
    if (
      lifecycleSnapshots.length !== docs.length ||
      lifecycleSnapshots.some((snap, index) => snap.ref.path !== lifecycleRefs[index].path)
    ) {
      throw new Error('piece-backfill-read-incomplete')
    }
  }
  const result = {
    mode, scanned: docs.length, processed: 0, eligible: 0, revoked: 0,
    missing: 0, mismatched: 0, unchanged: 0, wouldUpdate: 0, updated: 0,
    errors: [], nextCursor: null, pageComplete: false,
  }
  let lastProcessed = after
  for (let index = 0; index < docs.length; index += 1) {
    const doc = docs[index]
    try {
      const discoveredPiece = validatedPiece(doc)
      const row = mode === 'apply'
        ? await firestore.runTransaction(async (tx) => {
            // Recompute from current authority after discovery, including on retry.
            const currentPiece = await tx.get(doc.ref)
            const currentLifecycle = await tx.get(lifecycleRefs[index])
            const current = inspect(currentPiece, currentLifecycle)
            if (!isDeepStrictEqual(current.piece, discoveredPiece)) {
              throw invalid('PIECE_AUTHORITY_CHANGED')
            }
            if (current.needsUpdate) {
              tx.update(doc.ref, { studentListEligible: current.eligible })
            }
            return current
          })
        : inspect(doc, lifecycleSnapshots[index])
      result.processed += 1
      result[row.eligible ? 'eligible' : 'revoked'] += 1
      if (row.missing) result.missing += 1
      if (row.needsUpdate) {
        result.wouldUpdate += 1
        if (!row.missing) result.mismatched += 1
        if (mode === 'apply') result.updated += 1
      } else {
        result.unchanged += 1
      }
      lastProcessed = doc.id
    } catch (error) {
      result.errors.push({
        recordHash: createHash('sha256').update(doc.id).digest('hex').slice(0, 16),
        code: error.backfillCode ?? 'BACKFILL_OPERATION_FAILED',
      })
      result.nextCursor = lastProcessed
      return Object.freeze(result)
    }
  }
  result.pageComplete = docs.length < limit
  result.nextCursor = result.pageComplete ? null : lastProcessed
  return Object.freeze(result)
}
