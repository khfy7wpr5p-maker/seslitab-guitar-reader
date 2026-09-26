import {
  startSelectedSecureDeliveryServer,
} from './runtimeEntrypoint.js'

const runtime =
  await startSelectedSecureDeliveryServer({
    env: process.env,
  })

for (const signal of [
  'SIGINT',
  'SIGTERM',
]) {
  process.on(signal, async () => {
    try {
      await runtime.close()
      process.exit(0)
    } catch {
      process.exit(1)
    }
  })
}
