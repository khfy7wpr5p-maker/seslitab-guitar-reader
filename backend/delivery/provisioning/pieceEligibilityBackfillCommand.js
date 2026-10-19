import { validatePieceBackfillOptions } from '../firebase/pieceEligibilityBackfill.js'

const enabled = (value) => String(value ?? '').trim().toLowerCase() === 'true'

export function parsePieceBackfillArgs(argv) {
  const options = {
    production: false, emulator: false, projectId: null,
    mode: 'dry-run', limit: 50, after: null, compatibleWritersConfirmed: false,
  }
  const seen = new Set()
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (seen.has(arg)) throw new Error('piece-backfill-duplicate-argument')
    seen.add(arg)
    if (arg === '--production') options.production = true
    else if (arg === '--emulator') options.emulator = true
    else if (arg === '--compatible-writers-confirmed') options.compatibleWritersConfirmed = true
    else if (['--project', '--mode', '--limit', '--after'].includes(arg)) {
      const value = argv[++i]
      if (!value || value.startsWith('--')) throw new Error('piece-backfill-missing-argument-value')
      if (arg === '--project') options.projectId = value
      if (arg === '--mode') options.mode = value
      if (arg === '--after') options.after = value
      if (arg === '--limit') options.limit = /^\d+$/u.test(value) ? Number(value) : Number.NaN
    } else throw new Error('piece-backfill-unknown-argument')
  }
  if (options.production === options.emulator) throw new Error('piece-backfill-target-required')
  if (options.production && !options.projectId) throw new Error('piece-backfill-project-required')
  if (options.emulator && options.projectId !== null && options.projectId !== 'demo-seslitab-td06') {
    throw new Error('piece-backfill-emulator-project-mismatch')
  }
  validatePieceBackfillOptions(options)
  return Object.freeze(options)
}

export function authorizePieceBackfill(options, env = process.env) {
  if (options.production) {
    if (
      options.projectId !== env.SECURE_DELIVERY_FIREBASE_PROJECT_ID ||
      options.projectId === 'demo-seslitab-td06'
    ) throw new Error('piece-backfill-production-project-mismatch')
    if (!enabled(env.STUDENT_PIECE_BACKFILL_PRODUCTION_AUTHORIZED)) {
      throw new Error('piece-backfill-production-not-authorized')
    }
  }
  if (options.mode !== 'apply') return false
  if (!enabled(env.STUDENT_PIECE_BACKFILL_APPLY)) throw new Error('piece-backfill-apply-disabled')
  if (options.production && options.compatibleWritersConfirmed !== true) {
    throw new Error('piece-backfill-compatible-writers-not-confirmed')
  }
  return true
}
