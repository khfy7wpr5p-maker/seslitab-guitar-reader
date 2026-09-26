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
      const result =
        observeRequest(
          Object.freeze({
            event: 'secure_delivery_request',
            operation,
            outcome,
            status,
          }),
        )

      if (
        result &&
        typeof result.catch === 'function'
      ) {
        result.catch(() => {})
      }
    } catch {
      // Observability must never make Secure Delivery unavailable.
    }
  }

  const router = express.Router()

  function requireAvailable(
    operation,
    isEnabled,
    errorMessage,
  ) {
    return (_req, res, next) => {
      if (!isEnabled()) {
        const error =
          new Error(errorMessage)
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
      return next()
    }
  }

  function requireEnabled(operation) {
    return requireAvailable(
      operation,
      () => trustedConfig.enabled,
      'secure-delivery-feature-disabled',
    )
  }

  function requireWrites(operation) {
    return requireAvailable(
      operation,
      () => trustedConfig.writesEnabled,
      'secure-delivery-writes-disabled',
    )
  }

  function requireStudentReads(operation) {
    return requireAvailable(
      operation,
      () => trustedConfig.studentReadsEnabled,
      'secure-delivery-student-reads-disabled',
    )
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
    requireEnabled('teacher_prepared_assignments_create'),
    requireWrites('teacher_prepared_assignments_create'),
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
    requireEnabled('teacher_deliveries_create'),
    requireWrites('teacher_deliveries_create'),
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
    requireEnabled('teacher_deliveries_list'),
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
    requireEnabled('teacher_assignment_action'),
    requireWrites('teacher_assignment_action'),
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
    requireEnabled('teacher_piece_create'),
    requireWrites('teacher_piece_create'),
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
    requireEnabled('teacher_piece_action'),
    requireWrites('teacher_piece_action'),
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
    requireEnabled('student_pool_list'),
    requireStudentReads('student_pool_list'),
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
    requireEnabled('student_assignments_list'),
    requireStudentReads('student_assignments_list'),
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
    requireEnabled('student_pieces_list'),
    requireStudentReads('student_pieces_list'),
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
    requireEnabled('student_piece_get'),
    requireStudentReads('student_piece_get'),
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
    requireEnabled('student_assignment_get'),
    requireStudentReads('student_assignment_get'),
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
