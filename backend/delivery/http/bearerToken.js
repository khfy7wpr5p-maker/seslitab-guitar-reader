const MAX_BEARER_TOKEN_LENGTH = 8192

export function parseBearerToken(header) {
  if (typeof header !== 'string') {
    throw new Error(
      'authorization-bearer-token-required',
    )
  }

  const match = /^Bearer ([^\s]+)$/u.exec(header)
  if (!match) {
    throw new Error(
      'authorization-bearer-token-invalid',
    )
  }

  const token = match[1]
  if (
    token.length === 0 ||
    token.length > MAX_BEARER_TOKEN_LENGTH
  ) {
    throw new Error(
      'authorization-bearer-token-too-long',
    )
  }

  return token
}

export { MAX_BEARER_TOKEN_LENGTH }
