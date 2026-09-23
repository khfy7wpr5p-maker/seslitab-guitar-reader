const MAX_TOKEN_LENGTH = 8192

function normalizeBaseUrl(value) {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new TypeError(
      'baseUrl must be non-empty text.',
    )
  }
  const trimmed = value.trim()
  let end = trimmed.length
  while (
    end > 0 &&
    trimmed.charCodeAt(end - 1) === 47
  ) {
    end -= 1
  }
  if (end === 0) {
    throw new TypeError(
      'baseUrl must contain a non-slash value.',
    )
  }
  return trimmed.slice(0, end)
}

function publicApiError(payload, status) {
  const code =
    typeof payload?.error?.code === 'string'
      ? payload.error.code
      : 'SECURE_DELIVERY_REQUEST_FAILED'
  const message =
    typeof payload?.error?.message === 'string'
      ? payload.error.message
      : 'İstek doğrulanamadı.'
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

export function createSecureDeliveryApiClient({
  baseUrl,
  fetchImpl = globalThis.fetch,
  getIdToken,
} = {}) {
  const base = normalizeBaseUrl(baseUrl)
  if (typeof fetchImpl !== 'function') {
    throw new TypeError(
      'fetchImpl must be a function.',
    )
  }
  if (typeof getIdToken !== 'function') {
    throw new TypeError(
      'getIdToken must be a function.',
    )
  }

  async function request(
    path,
    {
      method = 'GET',
      body,
    } = {},
  ) {
    const token = await getIdToken()
    if (
      typeof token !== 'string' ||
      token.length === 0 ||
      token.length > MAX_TOKEN_LENGTH
    ) {
      throw new Error(
        'secure-delivery-auth-token-invalid',
      )
    }

    const headers = {
      Authorization: `Bearer ${token}`,
    }
    const init = {
      method,
      headers,
    }
    if (body !== undefined) {
      headers['Content-Type'] =
        'application/json'
      init.body = JSON.stringify(body)
    }

    const response = await fetchImpl(
      `${base}/${path}`,
      init,
    )
    let payload = null
    try {
      payload = await response.json()
    } catch {
      throw publicApiError(
        null,
        response?.status ?? 0,
      )
    }

    if (
      !response?.ok ||
      payload?.success !== true
    ) {
      throw publicApiError(
        payload,
        response?.status ?? 0,
      )
    }
    return payload.data
  }

  return Object.freeze({
    prepareAssignments(items) {
      return request(
        'teacher/prepared-assignments',
        {
          method: 'POST',
          body: { items },
        },
      )
    },

    deliverAssignments(assignmentIds) {
      return request(
        'teacher/deliveries',
        {
          method: 'POST',
          body: { assignmentIds },
        },
      )
    },

    listTeacherDeliveries() {
      return request(
        'teacher/deliveries',
      )
    },

    applyAssignmentAction(
      assignmentId,
      action,
    ) {
      const id = encodeURIComponent(
        String(assignmentId),
      )
      return request(
        `teacher/assignments/${id}/actions`,
        {
          method: 'POST',
          body: { action },
        },
      )
    },

    listStudentAssignments() {
      return request(
        'student/assignments',
      )
    },

    getStudentAssignment(deliveryId) {
      const id = encodeURIComponent(
        String(deliveryId),
      )
      return request(
        `student/assignments/${id}`,
      )
    },
  })
}
