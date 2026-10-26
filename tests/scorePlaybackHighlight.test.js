import assert from 'node:assert/strict'
import test from 'node:test'

import {
  beginScorePlaybackHighlight,
  endScorePlaybackHighlight,
  syncScorePlaybackNoteHighlight,
} from '../src/scoreViewUi.js'

function note(step, startBeat) {
  return {
    partId: 'P1',
    measureIndex: 0,
    measureKey: 'P1:0',
    voice: 1,
    staff: 1,
    startBeat,
    step,
    isRest: false,
  }
}

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

async function nextTurn() {
  await new Promise((resolve) => setImmediate(resolve))
}

test('playback drives the exact canonical score note highlight and clears stale sessions', async () => {
  const status = { dataset: {}, textContent: '' }
  const root = { getElementById: (id) => id === 'score-view-note-sync' ? status : null }
  const notes = [note('C', 0), note('D', 1)]
  const calls = []
  const runtime = {
    async clearHighlights() { calls.push('clear') },
    async highlight(payload) { calls.push(payload) },
  }

  const firstToken = beginScorePlaybackHighlight(root, notes, runtime)
  assert.equal(await syncScorePlaybackNoteHighlight(root, 0, firstToken, runtime), true)
  assert.deepEqual(calls.at(-1), {
    target: { partId: 'P1', measureIndex: 0, noteIndex: 0, voice: 1 },
    className: 'seslitab-note-focus',
  })
  assert.equal(status.dataset.playbackNoteSynced, 'true')

  const secondToken = beginScorePlaybackHighlight(root, notes, runtime)
  assert.equal(await syncScorePlaybackNoteHighlight(root, 1, firstToken, runtime), false)
  assert.equal(await syncScorePlaybackNoteHighlight(root, 1, secondToken, runtime), true)
  assert.deepEqual(calls.at(-1), {
    target: { partId: 'P1', measureIndex: 0, noteIndex: 1, voice: 1 },
    className: 'seslitab-note-focus',
  })

  assert.equal(await endScorePlaybackHighlight(root, secondToken, runtime), true)
  assert.equal(calls.at(-1), 'clear')
  assert.equal(status.dataset.playbackNoteSynced, 'false')
})

test('a superseded async highlight cannot overwrite the newest playback note', async () => {
  const status = { dataset: {}, textContent: '' }
  const root = { getElementById: (id) => id === 'score-view-note-sync' ? status : null }
  const notes = [note('C', 0), note('D', 1)]
  const firstHighlight = deferred()
  const calls = []
  let highlightCount = 0
  const runtime = {
    async clearHighlights() { calls.push('clear') },
    async highlight(payload) {
      calls.push(payload)
      highlightCount += 1
      if (highlightCount === 1) await firstHighlight.promise
    },
  }

  const firstToken = beginScorePlaybackHighlight(root, notes, runtime)
  const stale = syncScorePlaybackNoteHighlight(root, 0, firstToken, runtime)
  await nextTurn()
  const secondToken = beginScorePlaybackHighlight(root, notes, runtime)
  const current = syncScorePlaybackNoteHighlight(root, 1, secondToken, runtime)
  firstHighlight.resolve()

  assert.equal(await stale, false)
  assert.equal(await current, true)
  assert.deepEqual(calls.at(-1), {
    target: { partId: 'P1', measureIndex: 0, noteIndex: 1, voice: 1 },
    className: 'seslitab-note-focus',
  })
  assert.equal(status.dataset.playbackNoteSynced, 'true')
})

test('ending an old playback cannot restore static selection over a new session', async () => {
  const status = { dataset: {}, textContent: '' }
  const root = { getElementById: (id) => id === 'score-view-note-sync' ? status : null }
  const notes = [note('C', 0)]
  const clearing = deferred()
  let clearCount = 0
  const calls = []
  const runtime = {
    async clearHighlights() {
      calls.push('clear')
      clearCount += 1
      if (clearCount === 1) await clearing.promise
    },
    async highlight(payload) { calls.push(payload) },
  }

  const oldToken = beginScorePlaybackHighlight(root, notes, runtime)
  const ending = endScorePlaybackHighlight(root, oldToken, runtime)
  await nextTurn()
  const newToken = beginScorePlaybackHighlight(root, notes, runtime)
  clearing.resolve()

  assert.equal(await ending, false)
  assert.equal(calls.some((entry) => typeof entry === 'object'), false)
  assert.equal(await syncScorePlaybackNoteHighlight(root, 0, newToken, runtime), true)
  assert.equal(calls.some((entry) => typeof entry === 'object'), true)
})

test('a new session starting during static-highlight restore supersedes the old end operation', async () => {
  const status = { dataset: {}, textContent: '' }
  const root = { getElementById: (id) => id === 'score-view-note-sync' ? status : null }
  const notes = [note('C', 0)]
  const restoringClear = deferred()
  let clearCount = 0
  const runtime = {
    async clearHighlights() {
      clearCount += 1
      if (clearCount === 2) await restoringClear.promise
    },
    async highlight() { throw new Error('stale static highlight must not land') },
  }

  const oldToken = beginScorePlaybackHighlight(root, notes, runtime)
  const ending = endScorePlaybackHighlight(root, oldToken, runtime)
  await nextTurn()
  assert.equal(clearCount, 2)
  beginScorePlaybackHighlight(root, notes, runtime)
  restoringClear.resolve()

  assert.equal(await ending, false)
})
