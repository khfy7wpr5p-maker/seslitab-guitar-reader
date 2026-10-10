export function resolveGuitarTabEventMidi(event) {
  const soundingMidi = event?.soundingPitchMidi
  if (Number.isInteger(soundingMidi)) return soundingMidi
  const writtenMidi = event?.pitch?.midi
  return Number.isInteger(writtenMidi) ? writtenMidi : null
}
