export function createFirebaseTokenVerifier({
  auth,
} = {}) {
  if (
    !auth ||
    typeof auth.verifyIdToken !== 'function'
  ) {
    throw new TypeError(
      'auth must provide verifyIdToken().',
    )
  }

  return Object.freeze({
    async verifyIdToken(token) {
      if (
        typeof token !== 'string' ||
        token.length === 0
      ) {
        throw new TypeError(
          'Firebase ID token must be non-empty text.',
        )
      }

      const decoded =
        await auth.verifyIdToken(token, true)
      if (
        !decoded ||
        typeof decoded.uid !== 'string' ||
        decoded.uid.trim().length === 0
      ) {
        throw new Error(
          'firebase-token-uid-missing',
        )
      }

      return Object.freeze({
        uid: decoded.uid.trim(),
      })
    },
  })
}
