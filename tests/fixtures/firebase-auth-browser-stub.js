export const browserSessionPersistence =
  Object.freeze({ type: 'SESSION' })

export function getAuth() {
  throw new Error(
    'fixture must inject firebaseSdk',
  )
}

export async function setPersistence() {
  throw new Error(
    'fixture must inject firebaseSdk',
  )
}

export async function signInWithEmailAndPassword() {
  throw new Error(
    'fixture must inject firebaseSdk',
  )
}

export async function signOut() {
  throw new Error(
    'fixture must inject firebaseSdk',
  )
}
