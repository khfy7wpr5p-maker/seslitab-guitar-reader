function requiredMethods(value, methods, label) {
  for (const method of methods) {
    if (typeof value?.[method] !== 'function') {
      throw new TypeError(
        `${label} must provide ${method}().`,
      )
    }
  }
  return value
}

function boundedRows(value) {
  if (!Array.isArray(value)) {
    throw new TypeError(
      'student management rows must be an array.',
    )
  }
  return Object.freeze([...value])
}

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

function publicErrorCode(error) {
  const code = error?.code
  return typeof code === 'string' && code.length <= 64
    ? code
    : 'SERVICE_UNAVAILABLE'
}

export function createTeacherStudentManagementController({
  apiClient,
  clipboard = globalThis.navigator?.clipboard,
} = {}) {
  const client = requiredMethods(
    apiClient,
    [
      'createInvitation',
      'listStudents',
      'revokeInvitation',
    ],
    'apiClient',
  )
  const trustedClipboard = requiredMethods(
    clipboard,
    ['writeText'],
    'clipboard',
  )

  let rows = Object.freeze([])
  let loading = false
  let errorCode = null
  let pendingInvitationLink = null

  function getViewModel() {
    return Object.freeze({
      rows,
      loading,
      errorCode,
      invitationLinkReady:
        pendingInvitationLink !== null,
    })
  }

  async function refresh() {
    loading = true
    errorCode = null
    try {
      rows = boundedRows(
        await client.listStudents(),
      )
      return getViewModel()
    } catch (error) {
      errorCode = publicErrorCode(error)
      throw error
    } finally {
      loading = false
    }
  }

  async function createInvitation({
    email,
    displayNameOrNickname,
  } = {}) {
    errorCode = null
    let result
    try {
      result = await client.createInvitation({
        email,
        displayNameOrNickname,
      })
      pendingInvitationLink = requiredText(
        result?.invitationLink,
        'invitationLink',
        4096,
      )
      await refresh()
      return getViewModel()
    } catch (error) {
      errorCode = publicErrorCode(error)
      throw error
    }
  }

  async function copyInvitationLink() {
    if (pendingInvitationLink === null) {
      throw new Error('Invitation copy unavailable.')
    }

    try {
      await trustedClipboard.writeText(
        pendingInvitationLink,
      )
    } catch {
      throw new Error('Invitation copy unavailable.')
    }

    pendingInvitationLink = null
    return getViewModel()
  }

  async function revokeInvitation(managementId) {
    const inviteId = requiredText(
      managementId,
      'managementId',
      256,
    )
    const row = rows.find(
      (candidate) =>
        candidate?.managementId === inviteId,
    )

    if (row?.invitationStatus !== 'PENDING') {
      throw new Error(
        'Pending invitation is not available.',
      )
    }

    try {
      await client.revokeInvitation(inviteId)
      await refresh()
      return getViewModel()
    } catch (error) {
      errorCode = publicErrorCode(error)
      throw error
    }
  }

  return Object.freeze({
    refresh,
    createInvitation,
    copyInvitationLink,
    revokeInvitation,
    getViewModel,
  })
}
