import {
  TEACHER_AUTH_STATE,
} from './teacherAuthSessionController.js'

function element(root, tag, className = '') {
  const node = root.createElement(tag)
  if (className) {
    node.className = className
  }
  return node
}

function statusText(snapshot) {
  switch (snapshot?.state) {
    case TEACHER_AUTH_STATE
      .CONFIG_UNAVAILABLE:
      return 'Öğretmen girişi yapılandırılamadı.'
    case TEACHER_AUTH_STATE.SIGNING_IN:
      return 'Giriş yapılıyor.'
    case TEACHER_AUTH_STATE.AUTHENTICATED:
    case TEACHER_AUTH_STATE
      .CONNECTING_SECURE_DELIVERY:
      return 'Güvenli gönderim bağlantısı kuruluyor.'
    case TEACHER_AUTH_STATE.READY:
      return 'Öğretmen oturumu hazır.'
    case TEACHER_AUTH_STATE
      .SESSION_EXPIRED:
      return 'Oturum süresi doldu. Yeniden giriş yapın.'
    case TEACHER_AUTH_STATE
      .API_UNAVAILABLE:
      return 'Güvenli gönderim servisine ulaşılamıyor.'
    case TEACHER_AUTH_STATE.SIGNED_OUT:
      if (
        snapshot.reason ===
        'invalid-credentials'
      ) {
        return 'E-posta veya şifre doğrulanamadı.'
      }
      if (
        snapshot.reason ===
        'sign-in-unavailable'
      ) {
        return 'Giriş şu anda kullanılamıyor.'
      }
      return 'Öğretmen hesabınızla giriş yapın.'
    default:
      return 'Öğretmen oturumu hazırlanıyor.'
  }
}

function authenticatedState(state) {
  return new Set([
    TEACHER_AUTH_STATE.AUTHENTICATED,
    TEACHER_AUTH_STATE
      .CONNECTING_SECURE_DELIVERY,
    TEACHER_AUTH_STATE.READY,
    TEACHER_AUTH_STATE
      .API_UNAVAILABLE,
    TEACHER_AUTH_STATE
      .SESSION_EXPIRED,
  ]).has(state)
}

export function mountTeacherAuthSessionUi({
  root = globalThis.document,
  host,
  controller,
} = {}) {
  if (!host?.replaceChildren) {
    throw new TypeError(
      'host must be a DOM container.',
    )
  }
  if (
    !controller ||
    typeof controller.subscribe !==
      'function' ||
    typeof controller.signIn !==
      'function' ||
    typeof controller.signOut !==
      'function' ||
    typeof controller.start !==
      'function'
  ) {
    throw new TypeError(
      'controller must provide subscribe(), signIn(), signOut() and start().',
    )
  }

  const wrapper = element(
    root,
    'section',
    'teacher-auth-session',
  )
  wrapper.setAttribute(
    'aria-label',
    'Öğretmen oturumu',
  )

  const form = element(
    root,
    'form',
    'teacher-auth-session__form',
  )
  form.noValidate = true

  const emailLabel = element(root, 'label')
  emailLabel.textContent = 'Öğretmen e-postası'
  const email = element(root, 'input')
  email.type = 'email'
  email.name = 'teacherEmail'
  email.autocomplete = 'username'
  email.required = true
  emailLabel.appendChild(email)

  const passwordLabel = element(root, 'label')
  passwordLabel.textContent = 'Şifre'
  const password = element(root, 'input')
  password.type = 'password'
  password.name = 'teacherPassword'
  password.autocomplete =
    'current-password'
  password.required = true
  passwordLabel.appendChild(password)

  const submit = element(
    root,
    'button',
    'btn btn-primary btn-sm',
  )
  submit.type = 'submit'
  submit.textContent = 'Giriş Yap'

  const signOut = element(
    root,
    'button',
    'btn btn-secondary btn-sm',
  )
  signOut.type = 'button'
  signOut.textContent = 'Oturumu Kapat'
  signOut.hidden = true

  const retry = element(
    root,
    'button',
    'btn btn-secondary btn-sm',
  )
  retry.type = 'button'
  retry.textContent = 'Tekrar Dene'
  retry.hidden = true

  const status = element(
    root,
    'div',
    'teacher-auth-session__status',
  )
  status.setAttribute('role', 'status')
  status.setAttribute(
    'aria-live',
    'polite',
  )

  form.appendChild(emailLabel)
  form.appendChild(passwordLabel)
  form.appendChild(submit)

  wrapper.appendChild(form)
  wrapper.appendChild(signOut)
  wrapper.appendChild(retry)
  wrapper.appendChild(status)
  host.replaceChildren(wrapper)

  function render(snapshot) {
    const state = snapshot?.state
    const ready =
      state === TEACHER_AUTH_STATE.READY
    const busy = new Set([
      TEACHER_AUTH_STATE
        .BOOTSTRAPPING,
      TEACHER_AUTH_STATE.SIGNING_IN,
      TEACHER_AUTH_STATE.AUTHENTICATED,
      TEACHER_AUTH_STATE
        .CONNECTING_SECURE_DELIVERY,
    ]).has(state)

    form.hidden = ready
    email.disabled = busy
    password.disabled = busy
    submit.disabled = busy

    signOut.hidden =
      !authenticatedState(state)
    retry.hidden =
      state !==
      TEACHER_AUTH_STATE
        .API_UNAVAILABLE

    status.textContent =
      statusText(snapshot)
  }

  const unsubscribe =
    controller.subscribe(render)

  form.addEventListener(
    'submit',
    async (event) => {
      event.preventDefault()
      const input = {
        email: String(
          email.value ?? '',
        ).trim(),
        password: String(
          password.value ?? '',
        ),
      }
      password.value = ''
      await controller.signIn(input)
    },
  )

  signOut.addEventListener(
    'click',
    async () => {
      password.value = ''
      await controller.signOut()
    },
  )

  retry.addEventListener(
    'click',
    async () => {
      await controller.start()
    },
  )

  return Object.freeze({
    destroy() {
      unsubscribe()
      password.value = ''
      host.replaceChildren()
    },
  })
}
