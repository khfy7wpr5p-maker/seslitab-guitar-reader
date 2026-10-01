import assert from 'node:assert/strict'
import test from 'node:test'

import {
  TEACHER_AUTH_STATE,
} from '../src/teacherAuthSessionController.js'
import {
  mountTeacherAuthSessionUi,
} from '../src/teacherAuthSessionUi.js'
import {
  createFakeDocument,
} from './support/fakeTeacherPoolDom.js'

async function settle() {
  await new Promise((resolve) =>
    setImmediate(resolve),
  )
}

function controllerHarness() {
  const listeners = new Set()
  const calls = {
    signIn: [],
    signOut: 0,
    start: 0,
  }
  let snapshot = Object.freeze({
    state:
      TEACHER_AUTH_STATE.BOOTSTRAPPING,
    reason: null,
  })

  function emit(state, reason = null) {
    snapshot = Object.freeze({
      state,
      reason,
    })
    for (const listener of listeners) {
      listener(snapshot)
    }
  }

  return {
    calls,
    emit,
    controller: {
      getSnapshot() {
        return snapshot
      },
      subscribe(listener) {
        listeners.add(listener)
        listener(snapshot)
        return () =>
          listeners.delete(listener)
      },
      async signIn(input) {
        calls.signIn.push(input)
        return snapshot
      },
      async signOut() {
        calls.signOut += 1
        return snapshot
      },
      async start() {
        calls.start += 1
        return snapshot
      },
    },
  }
}

test('SES-146 auth UI submits Email/Password without retaining the password in visible state', async () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const h = controllerHarness()

  mountTeacherAuthSessionUi({
    root,
    host,
    controller: h.controller,
  })

  h.emit(
    TEACHER_AUTH_STATE.SIGNED_OUT,
  )

  const email = host.querySelector(
    'input[name="teacherEmail"]',
  )
  const password = host.querySelector(
    'input[name="teacherPassword"]',
  )
  const form = host.querySelector('form')

  email.value = 'teacher@example.test'
  password.value = 'private-password'

  await form.dispatchEventAsync({
    type: 'submit',
    preventDefault() {},
  })
  await settle()

  assert.deepEqual(
    h.calls.signIn,
    [{
      email: 'teacher@example.test',
      password: 'private-password',
    }],
  )
  assert.equal(password.value, '')
  assert.doesNotMatch(
    host.textContent,
    /private-password/,
  )
})

test('SES-146 auth UI renders safe messages for invalid credentials and session expiry', () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const h = controllerHarness()

  mountTeacherAuthSessionUi({
    root,
    host,
    controller: h.controller,
  })

  h.emit(
    TEACHER_AUTH_STATE.SIGNED_OUT,
    'invalid-credentials',
  )
  assert.match(
    host.querySelector('.teacher-auth-session__status').textContent,
    /E-posta veya şifre doğrulanamadı/,
  )

  h.emit(
    TEACHER_AUTH_STATE.SESSION_EXPIRED,
    'session-expired',
  )
  assert.match(
    host.querySelector('.teacher-auth-session__status').textContent,
    /Oturum süresi doldu/,
  )
  assert.doesNotMatch(
    host.querySelector('.teacher-auth-session__status').textContent,
    /Firebase|token|uid|provider/i,
  )
})

test('SES-146 auth UI exposes sign-out only for authenticated authority and calls controller signOut', async () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const h = controllerHarness()

  mountTeacherAuthSessionUi({
    root,
    host,
    controller: h.controller,
  })

  h.emit(
    TEACHER_AUTH_STATE.READY,
  )

  const signOut = host
    .querySelectorAll('button')
    .find(
      (button) =>
        button.textContent ===
        'Oturumu Kapat',
    )

  assert.equal(signOut.hidden, false)
  assert.match(
    host.querySelector('.teacher-auth-session__status').textContent,
    /Öğretmen oturumu hazır/,
  )

  await signOut.dispatchEventAsync({
    type: 'click',
  })
  await settle()

  assert.equal(h.calls.signOut, 1)
})

test('SES-146 API unavailable UI remains fail-closed and offers an explicit retry', async () => {
  const root = createFakeDocument()
  const host = root.createElement('div')
  const h = controllerHarness()

  mountTeacherAuthSessionUi({
    root,
    host,
    controller: h.controller,
  })

  h.emit(
    TEACHER_AUTH_STATE.API_UNAVAILABLE,
    'secure-delivery-unavailable',
  )

  assert.match(
    host.querySelector('.teacher-auth-session__status').textContent,
    /Güvenli gönderim servisine ulaşılamıyor/,
  )

  const retry = host
    .querySelectorAll('button')
    .find(
      (button) =>
        button.textContent ===
        'Tekrar Dene',
    )

  assert.equal(retry.hidden, false)

  await retry.dispatchEventAsync({
    type: 'click',
  })
  await settle()

  assert.equal(h.calls.start, 1)
})
