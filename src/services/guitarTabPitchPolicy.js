export const GUITAR_TAB_PITCH_POLICY = Object.freeze({
  SOURCE_SOUNDING: 'source-sounding',
  STANDARD_GUITAR_WRITTEN: 'standard-guitar-written',
})

const VALID_GUITAR_TAB_PITCH_POLICIES = new Set(Object.values(GUITAR_TAB_PITCH_POLICY))

function hasOwn(object, key) {
  return Boolean(object && typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, key))
}

export function normalizeGuitarTabPitchPolicy(
  value = GUITAR_TAB_PITCH_POLICY.SOURCE_SOUNDING,
) {
  if (typeof value !== 'string' || !VALID_GUITAR_TAB_PITCH_POLICIES.has(value)) {
    throw new Error(`UNSUPPORTED_GUITAR_TAB_PITCH_POLICY: ${String(value)}`)
  }
  return value
}

export function resolveGuitarTabEventMidi(event) {
  if (hasOwn(event, 'guitarPhysicalPitchMidi')) {
    const physicalMidi = event?.guitarPhysicalPitchMidi
    return Number.isInteger(physicalMidi) ? physicalMidi : null
  }
  const soundingMidi = event?.soundingPitchMidi
  if (Number.isInteger(soundingMidi)) return soundingMidi
  const writtenMidi = event?.pitch?.midi
  return Number.isInteger(writtenMidi) ? writtenMidi : null
}
