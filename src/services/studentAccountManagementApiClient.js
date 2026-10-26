const PUBLIC_ERROR_CODES = new Set([
  'INVALID_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
])

function requiredText(value, label, maxLength = 2048) {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a non-empty string.`)
  }

  const normalized = value.trim()
  if (
    normalized.length === 0 ||
    normalized.length > maxLength
  ) {
    throw new TypeError(`${label} must be a bounded non-empty string.`)
  }

  return normalized
}

function normalizedBaseUrl(value) {
  return requiredText(value, 'baseUrl').replace(/\/$/u, '')
}

export class StudentAccountManagementApiError extends Error {
  constructor({ status = 0, code = 'SERVICE_UNAVAILABLE' } = {}) {
    super('Student account management request failed.')
    this.name = 'StudentAccountManagementApiError'
    this.status = Number.isInteger(status) ? status : 0
    this.code = PUBLIC_ERROR_CODES.has(code)
      ? code
      : 'SERVICE_UNAVAILABLE'
  }
}

export function createStudentAccountManagementApiClient({
  baseUrl,
  fetchImpl = globalThis.fetch,
  getIdToken,
} = {}) {
  const root = normalizedBaseUrl(baseUrl)

  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetchImpl must be a function.')
  }
  if (typeof getIdToken !== 'function') {
    throw new TypeError('getIdToken must be a function.')
  }

  async function authenticatedRequest(path, {
    method,
    body,
  } = {}) {
    let token
    try {
      token = requiredText(
        await getIdToken(),
        'Firebase ID token',
        16384,
      )
    } catch {
      throw new StudentAccountManagementApiError({
        status: 401,
        code: 'UNAUTHORIZED',
      })
    }

    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    }
    const init = {
      method,
      headers,
      cache: 'no-store',
    }

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }

    let response
    try {
      response = await fetchImpl(`${root}/${path}`, init)
    } catch {
      throw new StudentAccountManagementApiError()
    }

    if (
      response === null ||
      typeof response !== 'object' ||
      typeof response.ok !== 'boolean' ||
      !Number.isInteger(response.status) ||
      typeof response.json !== 'function'
    ) {
      throw new StudentAccountManagementApiError()
    }

    let responseBody
    try {
      responseBody = await response.json()
    } catch {
      responseBody = null
    }

    if (
      !response.ok ||
      responseBody === null ||
      typeof responseBody !== 'object'
    ) {
      throw new StudentAccountManagementApiError({
        status: response.status,
        code: responseBody?.error,
      })
    }

    return responseBody
  }

  return Object.freeze({
    createInvitation({
      email,
      displayNameOrNickname,
    } = {}) {
      return authenticatedRequest(
        'teacher/invitations',
        {
          method: 'POST',
          body: {
            email: requiredText(email, 'email', 320),
            displayNameOrNickname: requiredText(
              displayNameOrNickname,
              'displayNameOrNickname',
              160,
            ),
          },
        },
      )
    },

    async listStudents() {
      const result = await authenticatedRequest(
        'teacher/students',
        { method: 'GET' },
      )

      if (!Array.isArray(result.students)) {
        throw new StudentAccountManagementApiError()
      }

      return Object.freeze([...result.students])
    },

    revokeInvitation(inviteId) {
      const normalizedInviteId = requiredText(
        inviteId,
        'inviteId',
        256,
      )
      return authenticatedRequest(
        `teacher/invitations/${encodeURIComponent(normalizedInviteId)}/revoke`,
        { method: 'POST' },
      )
    },
  })
}
