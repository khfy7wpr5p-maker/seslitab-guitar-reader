import { backfillPieceEligibilityPage } from '../backend/delivery/firebase/pieceEligibilityBackfill.js'
import { parsePieceBackfillArgs, authorizePieceBackfill } from '../backend/delivery/provisioning/pieceEligibilityBackfillCommand.js'

async function main() {
  const options = parsePieceBackfillArgs(process.argv.slice(2))
  const applyAuthorized = authorizePieceBackfill(options)
  const { createFirebaseAdminServices } = await import('../backend/delivery/firebase/firebaseAdmin.js')
  const admin = createFirebaseAdminServices({
    emulator: options.emulator,
    projectId: options.emulator ? 'demo-seslitab-td06' : options.projectId,
    productionAuthorized: options.production,
    appName: 'ses238-piece-eligibility-backfill',
  })
  try {
    const result = await backfillPieceEligibilityPage({
      firestore: admin.firestore,
      mode: options.mode,
      limit: options.limit,
      after: options.after,
      applyAuthorized,
    })
    process.stdout.write(JSON.stringify({ target: options.production ? 'production' : 'emulator', ...result }) + '\n')
    if (result.errors.length > 0 || (options.mode === 'verify' && result.wouldUpdate > 0)) process.exitCode = 1
  } finally {
    await admin.delete()
  }
}

main().catch(() => {
  // Never print credential-provider, SDK or document payload errors.
  process.stderr.write(JSON.stringify({ ok: false, error: 'piece-eligibility-backfill-failed' }) + '\n')
  process.exitCode = 1
})
