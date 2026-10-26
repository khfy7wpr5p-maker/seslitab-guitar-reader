import {
  mountTeacherStudentManagementProduction,
} from './teacherStudentManagementProductionMount.js'

function envText(env, name) {
  const value = env?.[name]
  return typeof value === 'string'
    ? value.trim()
    : ''
}

export function createTeacherStudentManagementRuntime({
  root = globalThis.document,
  env = import.meta.env,
  mount = mountTeacherStudentManagementProduction,
} = {}) {
  if (typeof mount !== 'function') {
    throw new TypeError(
      'mount must be a function.',
    )
  }

  const host =
    root &&
    typeof root.getElementById === 'function'
      ? root.getElementById(
          'teacher-student-management-host',
        )
      : null
  const baseUrl = envText(
    env,
    'VITE_SESLITAB_ACCOUNT_SERVICE_API_URL',
  )
  let handle = null

  function destroyCurrent() {
    const current = handle
    handle = null
    current?.destroy?.()
  }

  return Object.freeze({
    onReady(connection) {
      destroyCurrent()
      if (!host) {
        return null
      }

      const getIdToken =
        connection?.getIdToken
      if (typeof getIdToken !== 'function') {
        return null
      }

      handle = mount({
        root,
        host,
        baseUrl,
        getIdToken,
      })
      return handle
    },

    onAuthorityRevoked() {
      destroyCurrent()
    },
  })
}
