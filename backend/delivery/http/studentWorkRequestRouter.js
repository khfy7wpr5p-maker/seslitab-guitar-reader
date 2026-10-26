import express from 'express'

import { parseBearerToken } from './bearerToken.js'
import {
  secureDeliveryErrorStatus,
  sendSecureDeliveryError,
} from './errorResponse.js'
import {
  secureDeliveryFailureClass,
  secureDeliveryRequestOutcome,
} from '../observability/secureDeliveryRequestObserver.js'

function observeSafely(
  observeRequest,
  outcome,
  status,
  failureClass = null,
  operation = 'student_work_request_create',
) {
  if (typeof observeRequest !== 'function') return
  try {
    const result = observeRequest(Object.freeze({
      event: 'secure_delivery_request',
      operation,
      outcome,
      status,
      ...(failureClass === null
        ? {}
        : { failureClass }),
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
        secureDeliveryFailureClass(error),
      )
      return sendSecureDeliveryError(res, error)
    }
  })

  router.get('/student/work-requests/pending', async (req, res) => {
    const operation = 'student_work_request_list_pending'
    try {
      if (!config.enabled) throw new Error('secure-delivery-feature-disabled')
      if (config.studentReadsEnabled !== true) {
        throw new Error('secure-delivery-student-reads-disabled')
      }

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

      const data = await service.listSharedPendingForStudent({
        providerSubject: decoded.uid.trim(),
      })
      observeSafely(observeRequest, 'authorized', 200, null, operation)
      return res.status(200).json({ success: true, data })
    } catch (error) {
      const status = secureDeliveryErrorStatus(error)
      observeSafely(
        observeRequest,
        secureDeliveryRequestOutcome(error, status),
        status,
        secureDeliveryFailureClass(error),
        operation,
      )
      return sendSecureDeliveryError(res, error)
    }
  })

  return router
}
