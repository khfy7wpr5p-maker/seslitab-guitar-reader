export function resolveGuitarPhysicalPitch({
  writtenMidi,
  sourceTranspositionSemitones = 0,
  soundingPitchMidi = null,
} = {}) {
  if (!Number.isSafeInteger(writtenMidi) || writtenMidi < 0 || writtenMidi > 127) {
    throw new Error('Written pitch must be a valid MIDI integer.')
  }
  if (!Number.isSafeInteger(sourceTranspositionSemitones)) {
    throw new Error('Source transposition must be a whole number of semitones.')
  }
  const derivedSoundingMidi = writtenMidi + sourceTranspositionSemitones
  if (derivedSoundingMidi < 0 || derivedSoundingMidi > 127) {
    throw new Error('Source-derived sounding pitch is outside MIDI range.')
  }
  if (soundingPitchMidi !== null && soundingPitchMidi !== undefined) {
    if (!Number.isSafeInteger(soundingPitchMidi) || soundingPitchMidi !== derivedSoundingMidi) {
      throw new Error('Sounding pitch contradicts the source transposition.')
    }
  }
  return Object.freeze({
    writtenMidi,
    sourceTranspositionSemitones,
    soundingPitchMidi: derivedSoundingMidi,
  })
}
