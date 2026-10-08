import {
  createStudentAccountManagementApiClient,
} from './services/studentAccountManagementApiClient.js'
import {
  createTeacherStudentManagementController,
} from './services/teacherStudentManagementController.js'
import {
  mountTeacherStudentManagementUi,
} from './teacherStudentManagementUi.js'

function requiredSurface(root, host) {
  if (!root || typeof root.createElement !== 'function') {
    throw new TypeError('root must provide createElement().')
  }
  if (!host || typeof host.replaceChildren !== 'function') {
    throw new TypeError('host must provide replaceChildren().')
  }
}

function unavailable({
  root,
  host,
  reason,
  message,
}) {
  requiredSurface(root, host)

  const status = root.createElement('p')
  status.textContent = message
  status.setAttribute('role', 'status')
  host.replaceChildren(status)

  let destroyed = false
  return Object.freeze({
    ok: false,
    reason,
    destroy() {
      if (destroyed) return
      destroyed = true
      host.replaceChildren()
    },
  })
}

export function mountTeacherStudentManagementProduction({
  root = globalThis.document,
  host,
  baseUrl,
  getIdToken,
  fetchImpl = globalThis.fetch,
  clipboard = globalThis.navigator?.clipboard,
} = {}) {
  requiredSurface(root, host)

  const normalizedBaseUrl =
    typeof baseUrl === 'string'
      ? baseUrl.trim()
      : ''

  if (normalizedBaseUrl.length === 0) {
    return unavailable({
      root,
      host,
      reason: 'account-service-config-unavailable',
      message:
        'Öğrenci yönetimi servisi yapılandırılmadı.',
    })
  }

  const apiClient =
    createStudentAccountManagementApiClient({
      baseUrl: normalizedBaseUrl,
      fetchImpl,
      getIdToken,
    })
  const controller =
    createTeacherStudentManagementController({
      apiClient,
      clipboard,
    })
  const ui = mountTeacherStudentManagementUi({
    root,
    host,
    controller,
  })

  let destroyed = false
  const ready = controller
    .refresh()
    .then((viewModel) => {
      if (!destroyed) {
        ui.render()
      }
      return viewModel
    })

  return Object.freeze({
    ok: true,
    reason: null,
    ready,
    destroy() {
      if (destroyed) return
      destroyed = true
      ui.destroy()
    },
  })
}
