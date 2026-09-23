import express from 'express'

import { parseBearerToken } from './bearerToken.js'
import {
  sendSecureDeliveryError,
} from './errorResponse.js'

function assertConfig(config) {
  if (
    !config ||
    typeof config !== 'object' ||
    typeof config.enabled !== 'boolean' ||
    typeof config.writesEnabled !== 'boolean' ||
    typeof config.studentReadsEnabled !== 'boolean'
  ) {
    throw new TypeError(
      'secure delivery config must contain boolean flags.',
    )
  }
  return config
}

function assertServiceMethod(
  service,
  method,
  label,
) {
  if (
    !service ||
    typeof service !== 'object' ||
    typeof service[method] !== 'function'
  ) {
    throw new TypeError(
      `${label} must provide ${method}().`,
    )
  }
}

function success(res, data) {
  return res.status(200).json({
    success: true,
    data,
  })
}

function unavailable(res) {
  return sendSecureDeliveryError(
    res,
    new Error(
      'secure-delivery-composition-not-configured',
    ),
  )
}

export function createSecureDeliveryRouter({
  tokenVerifier,
  preparedService,
  teacherService,
  studentService,
  config,
} = {}) {
  const trustedConfig = assertConfig(config)

  if (
    !tokenVerifier ||
    typeof tokenVerifier.verifyIdToken !== 'function'
  ) {
    throw new TypeError(
      'tokenVerifier must provide verifyIdToken().',
    )
  }
  assertServiceMethod(
    preparedService,
    'prepareBatch',
    'preparedService',
  )
  for (const method of [
    'deliverBatch',
    'listDeliveries',
    'applyAssignmentAction',
  ]) {
    assertServiceMethod(
      teacherService,
      method,
      'teacherService',
    )
  }
  for (const method of [
    'listAssignments',
    'getAssignment',
  ]) {
    assertServiceMethod(
      studentService,
      method,
      'studentService',
    )
  }

  const router = express.Router()

  function requireEnabled(_req, res, next) {
    if (!trustedConfig.enabled) {
      return sendSecureDeliveryError(
        res,
        new Error(
          'secure-delivery-feature-disabled',
        ),
      )
    }
    return next()
  }

  function requireWrites(_req, res, next) {
    if (!trustedConfig.writesEnabled) {
      return sendSecureDeliveryError(
        res,
        new Error(
          'secure-delivery-writes-disabled',
        ),
      )
    }
    return next()
  }

  function requireStudentReads(_req, res, next) {
    if (!trustedConfig.studentReadsEnabled) {
      return sendSecureDeliveryError(
        res,
        new Error(
          'secure-delivery-student-reads-disabled',
        ),
      )
    }
    return next()
  }

  async function providerSubject(req) {
    let token
    try {
      token = parseBearerToken(
        req.get('authorization'),
      )
    } catch {
      throw new Error(
        'secure-delivery-auth-invalid',
      )
    }

    let decoded
    try {
      decoded =
        await tokenVerifier.verifyIdToken(token)
    } catch {
      throw new Error(
        'secure-delivery-auth-invalid',
      )
    }

    if (
      !decoded ||
      typeof decoded.uid !== 'string' ||
      decoded.uid.trim().length === 0
    ) {
      throw new Error(
        'secure-delivery-auth-invalid',
      )
    }

    return decoded.uid.trim()
  }

  function route(handler) {
    return async (req, res) => {
      try {
        const subject =
          await providerSubject(req)
        return await handler(
          req,
          res,
          subject,
        )
      } catch (error) {
        return sendSecureDeliveryError(
          res,
          error,
        )
      }
    }
  }

  router.post(
    '/teacher/prepared-assignments',
    requireEnabled,
    requireWrites,
    route(async (req, res, subject) =>
      success(
        res,
        await preparedService.prepareBatch({
          providerSubject: subject,
          items: req.body?.items,
        }),
      ),
    ),
  )

  router.post(
    '/teacher/deliveries',
    requireEnabled,
    requireWrites,
    route(async (req, res, subject) =>
      success(
        res,
        await teacherService.deliverBatch({
          providerSubject: subject,
          assignmentIds:
            req.body?.assignmentIds,
        }),
      ),
    ),
  )

  router.get(
    '/teacher/deliveries',
    requireEnabled,
    route(async (_req, res, subject) =>
      success(
        res,
        await teacherService.listDeliveries({
          providerSubject: subject,
        }),
      ),
    ),
  )

  router.post(
    '/teacher/assignments/:assignmentId/actions',
    requireEnabled,
    requireWrites,
    route(async (req, res, subject) =>
      success(
        res,
        await teacherService.applyAssignmentAction({
          providerSubject: subject,
          assignmentId:
            req.params.assignmentId,
          action: req.body?.action,
        }),
      ),
    ),
  )

  router.get(
    '/student/assignments',
    requireEnabled,
    requireStudentReads,
    route(async (_req, res, subject) =>
      success(
        res,
        await studentService.listAssignments({
          providerSubject: subject,
        }),
      ),
    ),
  )

  router.get(
    '/student/assignments/:deliveryId',
    requireEnabled,
    requireStudentReads,
    route(async (req, res, subject) =>
      success(
        res,
        await studentService.getAssignment({
          providerSubject: subject,
          deliveryId: req.params.deliveryId,
        }),
      ),
    ),
  )

  return router
}

export function createUnavailableSecureDeliveryRouter({
  config,
} = {}) {
  assertConfig(config)
  const router = express.Router()
  router.use((_req, res) =>
    unavailable(res),
  )
  return router
}
