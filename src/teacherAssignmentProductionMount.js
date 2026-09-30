function unavailable(reason) {
  return Object.freeze({
    mounted: false,
    reason,
    destroy() {},
  })
}

export function mountTeacherAssignmentProduction({
  root = globalThis.document,
  composition,
} = {}) {
  if (
    !composition ||
    typeof composition !== 'object'
  ) {
    return unavailable(
      'composition-unavailable',
    )
  }

  const teacherId =
    typeof composition
      .authenticatedTeacher
      ?.teacherId === 'string'
      ? composition
        .authenticatedTeacher
        .teacherId
        .trim()
      : ''

  if (teacherId.length === 0) {
    return unavailable(
      'teacher-auth-required',
    )
  }

  if (
    typeof composition
      .mountAssignmentSurface !==
      'function'
  ) {
    return unavailable(
      'assignment-surface-unavailable',
    )
  }

  const handle =
    composition.mountAssignmentSurface({
      root,
      teacherId,
    })

  if (
    !handle ||
    typeof handle.destroy !== 'function'
  ) {
    throw new TypeError(
      'mountAssignmentSurface() must return a handle with destroy().',
    )
  }

  let destroyed = false

  return Object.freeze({
    mounted: true,
    reason: null,
    destroy() {
      if (destroyed) return
      destroyed = true
      handle.destroy()
    },
  })
}
