import express from 'express'

import { parseBearerToken } from './bearerToken.js'
import {
  secureDeliveryErrorStatus,
  sendSecureDeliveryError,
} from './errorResponse.js'
import {
  secureDeliveryRequestOutcome,
} from '../observability/secureDeliveryRequestObserver.js'

function observeSafely(observeRequest, outcome, status) {
  if (typeof observeRequest !== 'function') return
  try {
    const result = observeRequest(Object.freeze({
      event: 'secure_delivery_request',
      operation: 'student_work_request_create',
      outcome,
      status,
    }))
    if (result && typeof result.catch === 'function') result.catch(() => {})
  } catch {
    // Observability is never an authorization dependency.
  }
}

export function createStudentWorkRequestRouter({
  tokenVerifier,
  service,
  config,
  observeRequest,
} = {}) {
  if (!tokenVerifier || typeof tokenVerifier.verifyIdToken !== 'function') {
    throw new TypeError('tokenVerifier must provide verifyIdToken().')
  }
  if (!service || typeof service.requestWork !== 'function') {
    throw new TypeError('service must provide requestWork().')
  }
  if (
    !config ||
    typeof config.enabled !== 'boolean' ||
    typeof config.writesEnabled !== 'boolean'
  ) {
    throw new TypeError('secure delivery config must provide enabled and writesEnabled.')
  }

  const router = express.Router()

  router.post('/student/work-requests', async (req, res) => {
    try {
      if (!config.enabled) throw new Error('secure-delivery-feature-disabled')
      if (!config.writesEnabled) throw new Error('secure-delivery-writes-disabled')

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

      const data = await service.requestWork({
        providerSubject: decoded.uid.trim(),
        title: req.body?.title,
      })
      observeSafely(observeRequest, 'authorized', 200)
      return res.status(200).json({ success: true, data })
    } catch (error) {
      const status = secureDeliveryErrorStatus(error)
      observeSafely(
        observeRequest,
        secureDeliveryRequestOutcome(error, status),
        status,
      )
      return sendSecureDeliveryError(res, error)
    }
  })

  return router
}
