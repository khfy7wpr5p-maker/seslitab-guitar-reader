function messageOf(error) {
  return error instanceof Error
    ? String(error.message || '')
    : ''
}

export function secureDeliveryErrorStatus(error) {
  const message = messageOf(error).toLowerCase()

  if (
    /authorization-bearer|auth-invalid|unauthenticated|identity-mapping-missing/.test(
      message,
    )
  ) {
    return 401
  }

  if (
    /wrong-role|grant|forbidden|authority-mismatch/.test(
      message,
    )
  ) {
    return 403
  }

  if (/not-found/.test(message)) {
    return 404
  }

  if (
    /feature-disabled|writes-disabled|student-reads-disabled|composition-not-configured/.test(
      message,
    )
  ) {
    return 503
  }

  if (
    /conflict|revoked|transition-not-allowed|acknowledgement/.test(
      message,
    )
  ) {
    return 409
  }

  if (error instanceof TypeError) {
    return 400
  }

  return 400
}

function codeForStatus(status) {
  if (status === 401) return 'UNAUTHENTICATED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'CONFLICT'
  if (status === 503) return 'SECURE_DELIVERY_UNAVAILABLE'
  return 'INVALID_REQUEST'
}

function messageForStatus(status) {
  if (status === 401) return 'Kimlik doğrulanamadı.'
  if (status === 403) return 'Bu işlem için yetkiniz yok.'
  if (status === 404) return 'Kayıt bulunamadı.'
  if (status === 409) return 'İşlem mevcut durumla uyuşmuyor.'
  if (status === 503) return 'Güvenli teslimat şu anda kullanılamıyor.'
  return 'İstek doğrulanamadı.'
}

export function sendSecureDeliveryError(res, error) {
  const status = secureDeliveryErrorStatus(error)
  return res.status(status).json({
    success: false,
    error: {
      code: codeForStatus(status),
      message: messageForStatus(status),
    },
  })
}
