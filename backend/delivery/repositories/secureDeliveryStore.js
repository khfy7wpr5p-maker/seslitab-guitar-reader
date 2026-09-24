const REQUIRED_METHODS = Object.freeze([
  'getIdentityMapping',
  'getTeacherStudentGrant',
  'getPreparedAssignment',
  'getPracticePackage',
  'getLifecycle',
  'getDelivery',
  'getPieceAssignment',
  'getPieceLifecycle',
  'listPieceAssignmentsForStudent',
  'putPieceAssignment',
  'commitPieceLifecycleMutation',
  'listDeliveriesForTeacher',
  'listActiveDeliveriesForStudent',
  'commitPreparedBatch',
  'commitDeliveryBatch',
  'commitLifecycleMutation',
  'putRosterEntriesForProvisioning',
  'putPoolPublicationsForProvisioning',
])

export function assertSecureDeliveryStore(store) {
  if (!store || typeof store !== 'object') {
    throw new TypeError('secure delivery store must be an object.')
  }
  for (const method of REQUIRED_METHODS) {
    if (typeof store[method] !== 'function') {
      throw new TypeError(
        `secure delivery store must provide ${method}().`,
      )
    }
  }
  return store
}
