import express from 'express'

import { parseBearerToken } from './bearerToken.js'
import {
  secureDeliveryErrorStatus,
  sendSecureDeliveryError,
} from './errorResponse.js'
import {
  secureDeliveryRequestOutcome,
} from '../observability/secureDeliveryRequestObserver.js'

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
  teacherPieceService,
  studentService,
  config,
  observeRequest,
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
    'createPiece',
    'applyPieceAction',
  ]) {
    assertServiceMethod(
      teacherPieceService,
      method,
      'teacherPieceService',
    )
  }
  for (const method of [
    'listAssignments',
    'getAssignment',
    'listPieces',
    'getPiece',
    'listPoolItems',
  ]) {
    assertServiceMethod(
      studentService,
      method,
      'studentService',
    )
  }

  if (
    observeRequest !== undefined &&
    typeof observeRequest !== 'function'
  ) {
    throw new TypeError(
      'observeRequest must be a function when provided.',
    )
  }

  function observe(
    operation,
    outcome,
    status,
  ) {
    if (typeof observeRequest !== 'function') {
      return
    }
    try {
      observeRequest(
        Object.freeze({
          event: 'secure_delivery_request',
          operation,
          outcome,
          status,
        }),
      )
    } catch {
      // Observability must never make Secure Delivery unavailable.
    }
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

  function route(
    operation,
    handler,
  ) {
    return async (req, res) => {
      try {
        const subject =
          await providerSubject(req)
        const response =
          await handler(
            req,
            res,
            subject,
          )
        observe(
          operation,
          'authorized',
          res.statusCode,
        )
        return response
      } catch (error) {
        const status =
          secureDeliveryErrorStatus(error)
        observe(
          operation,
          secureDeliveryRequestOutcome(
            error,
            status,
          ),
          status,
        )
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
    route('teacher_prepared_assignments_create', async (req, res, subject) =>
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
    route('teacher_deliveries_create', async (req, res, subject) =>
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
    route('teacher_deliveries_list', async (_req, res, subject) =>
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
    route('teacher_assignment_action', async (req, res, subject) =>
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


  router.post(
    '/teacher/pieces',
    requireEnabled,
    requireWrites,
    route('teacher_piece_create', async (req, res, subject) =>
      success(
        res,
        await teacherPieceService.createPiece({
          providerSubject: subject,
          input: req.body,
        }),
      ),
    ),
  )

  router.post(
    '/teacher/pieces/:pieceAssignmentId/actions',
    requireEnabled,
    requireWrites,
    route('teacher_piece_action', async (req, res, subject) =>
      success(
        res,
        await teacherPieceService.applyPieceAction({
          providerSubject: subject,
          pieceAssignmentId:
            req.params.pieceAssignmentId,
          action: req.body?.action,
        }),
      ),
    ),
  )

  router.get(
    '/student/pool',
    requireEnabled,
    requireStudentReads,
    route('student_pool_list', async (_req, res, subject) =>
      success(
        res,
        await studentService.listPoolItems({
          providerSubject: subject,
        }),
      ),
    ),
  )

  router.get(
    '/student/assignments',
    requireEnabled,
    requireStudentReads,
    route('student_assignments_list', async (_req, res, subject) =>
      success(
        res,
        await studentService.listAssignments({
          providerSubject: subject,
        }),
      ),
    ),
  )


  router.get(
    '/student/pieces',
    requireEnabled,
    requireStudentReads,
    route('student_pieces_list', async (_req, res, subject) =>
      success(
        res,
        await studentService.listPieces({
          providerSubject: subject,
        }),
      ),
    ),
  )

  router.get(
    '/student/pieces/:pieceAssignmentId',
    requireEnabled,
    requireStudentReads,
    route('student_piece_get', async (req, res, subject) =>
      success(
        res,
        await studentService.getPiece({
          providerSubject: subject,
          pieceAssignmentId:
            req.params.pieceAssignmentId,
        }),
      ),
    ),
  )

  router.get(
    '/student/assignments/:deliveryId',
    requireEnabled,
    requireStudentReads,
    route('student_assignment_get', async (req, res, subject) =>
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
