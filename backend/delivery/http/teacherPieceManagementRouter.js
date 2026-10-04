import express from 'express'

import { parseBearerToken } from './bearerToken.js'
import { sendSecureDeliveryError } from './errorResponse.js'

function assertDependencies({ tokenVerifier, service, config }) {
  if (!tokenVerifier || typeof tokenVerifier.verifyIdToken !== 'function') {
    throw new TypeError('tokenVerifier must provide verifyIdToken().')
  }
  for (const method of [
    'listPieces',
    'listPendingRequests',
    'applyPendingRequestAction',
  ]) {
    if (!service || typeof service[method] !== 'function') {
      throw new TypeError(`service must provide ${method}().`)
    }
  }
  if (
    !config ||
    typeof config.enabled !== 'boolean' ||
    typeof config.writesEnabled !== 'boolean'
  ) {
    throw new TypeError(
      'secure delivery config must provide enabled and writesEnabled.',
    )
  }
}

async function providerSubject(req, tokenVerifier) {
  let token
  try {
    token = parseBearerToken(req.get('authorization'))
  } catch {
    throw new Error('secure-delivery-auth-invalid')
  }
  let decoded
  try {
    decoded = await tokenVerifier.verifyIdToken(token)
  } catch {
    throw new Error('secure-delivery-auth-invalid')
  }
  if (!decoded || typeof decoded.uid !== 'string' || decoded.uid.trim() === '') {
    throw new Error('secure-delivery-auth-invalid')
  }
  return decoded.uid.trim()
}

export function createTeacherPieceManagementRouter({
  tokenVerifier,
  service,
  config,
} = {}) {
  assertDependencies({ tokenVerifier, service, config })
  const router = express.Router()

  router.get('/teacher/pieces', async (req, res) => {
    try {
      if (!config.enabled) throw new Error('secure-delivery-feature-disabled')
      const data = await service.listPieces({
        providerSubject: await providerSubject(req, tokenVerifier),
      })
      return res.status(200).json({ success: true, data })
    } catch (error) {
      return sendSecureDeliveryError(res, error)
    }
  })

  router.get('/teacher/work-requests', async (req, res) => {
    try {
      if (!config.enabled) throw new Error('secure-delivery-feature-disabled')
      const data = await service.listPendingRequests({
        providerSubject: await providerSubject(req, tokenVerifier),
      })
      return res.status(200).json({ success: true, data })
    } catch (error) {
      return sendSecureDeliveryError(res, error)
    }
  })

  router.post('/teacher/work-requests/:actionKey/actions', async (req, res) => {
    try {
      if (!config.enabled) throw new Error('secure-delivery-feature-disabled')
      if (!config.writesEnabled) throw new Error('secure-delivery-writes-disabled')
      const data = await service.applyPendingRequestAction({
        providerSubject: await providerSubject(req, tokenVerifier),
        actionKey: req.params.actionKey,
        action: req.body?.action,
        piece: req.body?.piece,
      })
      return res.status(200).json({ success: true, data })
    } catch (error) {
      return sendSecureDeliveryError(res, error)
    }
  })

  return router
}
