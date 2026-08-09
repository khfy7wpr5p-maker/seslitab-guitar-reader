import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createMusicXmlStorage } from '../backend/storage/musicXmlStorage.js'
import * as jobManager from '../backend/jobs/jobManager.js'
import * as queue from '../backend/queue/uploadQueue.js'
import { runCleanup } from '../backend/services/cleanupService.js'

let root, store
const id = (n) => `job_${String(1900000000 + n)}_abc123`
const base = (jobId, status, extra = {}) => ({ schemaVersion: 1, jobId, status, fileName: 'score.pdf', provider: 'mock', inputPath: 'input.pdf', musicXmlPath: null, progress: 0, workerId: null, retryCount: 0, maxRetries: 2, timeoutSeconds: 120, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', queuedAt: null, processingAt: null, musicxmlCreatedAt: null, completedAt: null, expiredAt: null, error: null, cancellationResult: null, retentionClass: 'runtime', retentionUntil: null, cleanupEligible: false, teacherApproved: false, protected: false, ...extra })
async function seed(n, status, { input = true, xml = null, ...extra } = {}) { const jobId = id(n); if (input) await store.writePdf(jobId, Buffer.from('%PDF')); if (xml != null) await store.writeMusicXml(jobId, xml); await store.writeMetadata(jobId, base(jobId, status, { musicXmlPath: xml != null ? 'output.musicxml' : null, ...extra })); return jobId }

beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'seslitab-recovery-')); store = createMusicXmlStorage(root); await store.initialize(); jobManager.resetForTests(); queue.clear() })
afterEach(async () => { queue.clear(); jobManager.resetForTests(); await fs.rm(root, { recursive: true, force: true }) })

test('atomic metadata write leaves valid canonical JSON and ignores leftover temp', async () => {
  const jobId = id(1); await store.writePdf(jobId, Buffer.from('%PDF')); await store.writeMetadata(jobId, base(jobId, 'queued'))
  await fs.writeFile(path.join(root, jobId, `.metadata.${jobId}.leftover.tmp`), '{partial')
  const read = await store.readMetadata(jobId)
  assert.equal(read.ok, true); assert.equal(read.metadata.status, 'queued')
  const canonical = await fs.readFile(path.join(root, jobId, 'metadata.json'), 'utf8')
  assert.doesNotThrow(() => JSON.parse(canonical))
})

test('metadata validation protects mismatch, traversal, unsupported, malformed and missing data', async () => {
  const cases = [
    [2, { ...base(id(2), 'queued'), jobId: id(99) }, 'METADATA_JOB_ID_MISMATCH'],
    [3, { ...base(id(3), 'queued'), inputPath: '../secret.pdf' }, 'UNSAFE_METADATA_PATH'],
    [4, { ...base(id(4), 'queued'), schemaVersion: 99 }, 'UNSUPPORTED_METADATA_SCHEMA'],
  ]
  for (const [n, meta, code] of cases) { const dir = path.join(root, id(n)); await fs.mkdir(dir); await fs.writeFile(path.join(dir, 'metadata.json'), JSON.stringify(meta)); assert.equal((await store.readMetadata(id(n))).code, code) }
  const malformed = path.join(root, id(5)); await fs.mkdir(malformed); await fs.writeFile(path.join(malformed, 'metadata.json'), '{bad'); assert.equal((await store.readMetadata(id(5))).code, 'MALFORMED_METADATA')
  await fs.mkdir(path.join(root, id(6))); assert.equal((await store.readMetadata(id(6))).code, 'METADATA_MISSING')
  const result = await jobManager.recoverJobs({ storageApi: store, queueApi: queue })
  assert.equal(result.recovered, 0); assert.equal(result.protected.length, 5)
  for (let n = 2; n <= 6; n++) assert.equal(await store.exists(id(n)), true)
})

test('uploaded and queued jobs with input recover into the real queue exactly once', async () => {
  const uploaded = await seed(10, 'uploaded'); const queued = await seed(11, 'queued', { retryCount: 1 })
  const first = await jobManager.recoverJobs({ storageApi: store, queueApi: queue }); const second = await jobManager.recoverJobs({ storageApi: store, queueApi: queue })
  assert.deepEqual(first.enqueued.sort(), [queued, uploaded].sort()); assert.equal(queue.size(), 2); assert.equal(second.enqueued.length, 0)
  assert.equal((await jobManager.getJob(uploaded)).status, 'queued'); assert.equal((await jobManager.getJob(queued)).retryCount, 1)
})

test('uploaded and queued jobs missing input become failed and remain preserved', async () => {
  const a = await seed(12, 'uploaded', { input: false }); const b = await seed(13, 'queued', { input: false })
  await jobManager.recoverJobs({ storageApi: store, queueApi: queue })
  for (const jobId of [a, b]) { const job = await jobManager.getJob(jobId); assert.equal(job.status, 'failed'); assert.equal(job.error.code, 'RECOVERY_INPUT_MISSING'); assert.equal(await store.exists(jobId), true); assert.equal(queue.contains(jobId), false) }
})

test('processing and musicxml_created become failed/RESTART_INTERRUPTED without losing evidence', async () => {
  const processing = await seed(14, 'processing'); const xml = '<score-partwise>evidence</score-partwise>'; const created = await seed(15, 'musicxml_created', { xml })
  await jobManager.recoverJobs({ storageApi: store, queueApi: queue })
  for (const jobId of [processing, created]) { const job = await jobManager.getJob(jobId); assert.equal(job.status, 'failed'); assert.equal(job.error.code, 'RESTART_INTERRUPTED'); assert.equal(job.error.retryable, true); assert.equal(queue.contains(jobId), false) }
  assert.equal(await store.readMusicXml(created), xml)
})

test('terminal states remain terminal and completed bytes remain unchanged', async () => {
  const failed = await seed(16, 'failed', { error: { code: 'X', message: 'x' } }); const canceled = await seed(17, 'failed', { error: { code: 'CANCELLED', message: 'cancel' } }); const xml = '<score-partwise>final</score-partwise>'; const completed = await seed(18, 'completed', { xml }); const expired = await seed(19, 'expired')
  await jobManager.recoverJobs({ storageApi: store, queueApi: queue })
  assert.equal((await jobManager.getJob(failed)).error.code, 'X'); assert.equal((await jobManager.getJob(canceled)).error.code, 'CANCELLED'); assert.equal((await jobManager.getJob(completed)).status, 'completed'); assert.equal(await store.readMusicXml(completed), xml); assert.equal((await jobManager.getJob(expired)).status, 'expired'); assert.equal(queue.size(), 0)
})

test('cleanup protects unknown, malformed, teacher-approved, protected and nonterminal data', async () => {
  const unknown = id(20); await fs.mkdir(path.join(root, unknown)); const malformed = id(21); await fs.mkdir(path.join(root, malformed)); await fs.writeFile(path.join(root, malformed, 'metadata.json'), '{bad')
  const teacher = await seed(22, 'expired', { cleanupEligible: true, retentionClass: 'teacher_approved', teacherApproved: true }); const protectedId = await seed(23, 'expired', { cleanupEligible: true, retentionClass: 'protected', protected: true }); const queued = await seed(24, 'queued', { cleanupEligible: true })
  await jobManager.recoverJobs({ storageApi: store, queueApi: queue }); await runCleanup({ storageApi: store, jobManagerApi: jobManager, queueApi: queue, activeCheck: () => false })
  for (const jobId of [unknown, malformed, teacher, protectedId, queued]) assert.equal(await store.exists(jobId), true)
})

test('cleanup deletes only exact eligible expired runtime data and is idempotent', async () => {
  const eligible = await seed(25, 'expired', { cleanupEligible: true, retentionClass: 'runtime', retentionUntil: '2026-01-01T00:00:00.000Z' }); const ineligible = await seed(26, 'expired', { cleanupEligible: false, retentionClass: 'runtime', retentionUntil: '2026-01-01T00:00:00.000Z' })
  await jobManager.recoverJobs({ storageApi: store, queueApi: queue })
  const first = await runCleanup({ storageApi: store, jobManagerApi: jobManager, queueApi: queue, activeCheck: () => false }); const second = await runCleanup({ storageApi: store, jobManagerApi: jobManager, queueApi: queue, activeCheck: () => false })
  assert.deepEqual(first.cleaned, [eligible]); assert.deepEqual(second.cleaned, []); assert.equal(await store.exists(eligible), false); assert.equal(await store.exists(ineligible), true)
})

test('cleanup promotes ordinary terminal runtime jobs only after the effective retention deadline', async () => {
  const completed = await seed(28, 'completed', { completedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', xml: '<score-partwise>done</score-partwise>' })
  const failed = await seed(29, 'failed', { updatedAt: '2026-01-01T00:00:00.000Z', error: { code: 'X', message: 'x' } })
  const deferred = await seed(30, 'completed', { completedAt: '2026-01-01T00:00:00.000Z', retentionUntil: '2999-01-01T00:00:00.000Z' })
  const teacher = await seed(31, 'completed', { completedAt: '2026-01-01T00:00:00.000Z', retentionClass: 'teacher_approved', teacherApproved: true })
  const protectedId = await seed(32, 'failed', { updatedAt: '2026-01-01T00:00:00.000Z', retentionClass: 'protected', protected: true, error: { code: 'X', message: 'x' } })
  await jobManager.recoverJobs({ storageApi: store, queueApi: queue })
  const transitions = []
  const jobManagerApi = {
    isRecoveryComplete: jobManager.isRecoveryComplete,
    snapshot: jobManager.snapshot,
    deleteJobRecord: jobManager.deleteJobRecord,
    async updateStatus(jobId, status, extra) { transitions.push({ jobId, status, extra }); return jobManager.updateStatus(jobId, status, extra) },
  }
  const result = await runCleanup({ storageApi: store, jobManagerApi, queueApi: queue, activeCheck: () => false })
  assert.deepEqual([...result.cleaned].sort(), [completed, failed].sort())
  assert.equal(await store.exists(completed), false); assert.equal(await store.exists(failed), false)
  for (const jobId of [deferred, teacher, protectedId]) assert.equal(await store.exists(jobId), true)
  assert.deepEqual(transitions.map((t) => t.jobId).sort(), [completed, failed].sort())
  for (const transition of transitions) {
    assert.equal(transition.status, 'expired')
    assert.equal(transition.extra.cleanupEligible, true)
    assert.equal(typeof transition.extra.retentionUntil, 'string')
    assert.equal(Date.parse(transition.extra.retentionUntil) <= Date.now(), true)
  }
})

test('recovery failure preserves directories and never marks recovery complete', async () => {
  const jobId = await seed(27, 'queued')
  const failingQueue = { async enqueue() { throw new Error('queue failed') } }
  await assert.rejects(jobManager.recoverJobs({ storageApi: store, queueApi: failingQueue }), /queue failed/)
  assert.equal(jobManager.isRecoveryComplete(), false); assert.equal(await store.exists(jobId), true)
})
