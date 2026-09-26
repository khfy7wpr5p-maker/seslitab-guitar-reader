import {
  selectSecureDeliveryServerModule,
} from './runtimeEntrypoint.js'

const modulePath =
  selectSecureDeliveryServerModule(
    process.env,
  )

await import(modulePath)
