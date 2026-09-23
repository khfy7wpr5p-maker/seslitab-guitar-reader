import { createHash } from 'node:crypto'

import {
  canonicalChordBoardVoicingJson,
} from '../../../src/services/chordBoardVoicingCanonical.js'

export function fingerprintChordBoardVoicingSync(value) {
  return createHash('sha256')
    .update(
      canonicalChordBoardVoicingJson(value),
      'utf8',
    )
    .digest('hex')
}
