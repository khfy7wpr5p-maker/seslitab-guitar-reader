import express from 'express'
import cors from 'cors'

import {
  PUBLISHED_FRONTEND_ORIGIN,
  PUBLISHED_STUDENT_APP_ORIGIN,
  createSecureDeliveryCorsOptions,
  parseSecureDeliveryAllowedOrigins,
} from '../../security/corsPolicy.js'
import {
  createSecureDeliveryProductionBoundary,
} from './secureDeliveryProductionBoundary.js'

export async function createSecureDeliveryProductionHttpApp({
  env = process.env,
  boundary,
} = {}) {
  const resolvedBoundary =
    boundary ??
    await createSecureDeliveryProductionBoundary({
      env,
    })

  const allowedOrigins =
    parseSecureDeliveryAllowedOrigins(
      env.SECURE_DELIVERY_ALLOWED_ORIGINS,
      env.NODE_ENV,
    )

  const app = express()
  app.disable('x-powered-by')

  app.use(
    cors(
      createSecureDeliveryCorsOptions(
        allowedOrigins,
      ),
    ),
  )

  app.use(
    express.json({
      limit: '16kb',
    }),
  )

  app.get('/health', (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        mode:
          'secure-delivery-production',
        active:
          resolvedBoundary.active === true,
        studentReadsEnabled:
          resolvedBoundary.config
            ?.studentReadsEnabled === true,
        writesEnabled:
          resolvedBoundary.config
            ?.writesEnabled === true,
      },
    })
  })

  app.use(
    '/api/secure-delivery/v1',
    resolvedBoundary.router,
  )

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message:
          'Endpoint bulunamadı.',
      },
    })
  })

  return Object.freeze({
    app,
    boundary: resolvedBoundary,
    allowedOrigins:
      Object.freeze([
        ...allowedOrigins,
      ]),
    publishedOrigins:
      Object.freeze([
        PUBLISHED_FRONTEND_ORIGIN,
        PUBLISHED_STUDENT_APP_ORIGIN,
      ]),
  })
}
