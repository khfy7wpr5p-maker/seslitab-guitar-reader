function hasOwn(object, key) {
  return Boolean(object && typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, key))
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
