// Tab parser for SesliTab
// Converts ASCII guitar tab into Turkish spoken text, reading column by column (left to right = time order).
//
// Supports:
//   - Multiple consecutive 6-string TAB blocks (e, B, G, D, A, E order)
//   - Optional "|" separator after the string letter
//   - Line-end annotations: ")", "x2", "x3", "(x2)" repeat marks
//   - Real "x" muted notes inside the TAB body are preserved

const STRING_NAMES = {
  e: 'birinci',
  B: 'ikinci',
  G: 'üçüncü',
  D: 'dördüncü',
  A: 'beşinci',
  E: 'altıncı',
}

// Order from highest (1st) to lowest (6th) string
const STRING_ORDER = ['e', 'B', 'G', 'D', 'A', 'E']

// Expected order inside a 6-string block (top to bottom)
const BLOCK_STRING_ORDER = ['e', 'B', 'G', 'D', 'A', 'E']

const ORDINALS = {
  1: 'birinci',
  2: 'ikinci',
  3: 'üçüncü',
  4: 'dördüncü',
  5: 'beşinci',
  6: 'altıncı',
  7: 'yedinci',
  8: 'sekizinci',
  9: 'dokuzuncu',
  10: 'onuncu',
  11: 'on birinci',
  12: 'on ikinci',
  13: 'on üçüncü',
  14: 'on dördüncü',
  15: 'on beşinci',
  16: 'on altıncı',
  17: 'on yedinci',
  18: 'on sekizinci',
  19: 'on dokuzuncu',
  20: 'yirminci',
  21: 'yirmi birinci',
  22: 'yirmi ikinci',
  23: 'yirmi üçüncü',
  24: 'yirmi dördüncü',
}

export function fretToText(fret) {
  const n = parseInt(fret, 10)
  if (Number.isNaN(n)) return fret
  if (n === 0) return 'açık tel'
  return ORDINALS[n] ? `${ORDINALS[n]} perde` : `${n}. perde`
}

// =============================================================================
// normalizeTabInput — safe, deterministic pre-processing of raw TAB text.
//
// 1. Converts \r\n and \r to \n.
// 2. Trims trailing spaces on every line and drops empty lines.
// 3. Detects 6-string blocks (lines starting with e/B/G/D/A/E).
// 4. Strips line-end annotations: ")", "x2", "x3", "(x2)" repeat marks.
// 5. Preserves the string letter and the optional "|" separator.
// 6. Returns { normalized, blocks, error } where blocks is an array of
//    { lines: string[], repeat: number }.
// 7. If the structure is unclear, returns a Turkish error — never guesses.
// =============================================================================

// Match string letter case-insensitively. Position in the block determines the actual string:
// position 0 = high e (1st string), position 5 = low E (6th string).
const STRING_LETTER_RE = /^[ \t]*([eEbBgGdDaA])/

/**
 * Normalize raw TAB input. Returns { normalized, blocks, error }.
 * @param {string} raw
 * @returns {{ normalized: string, blocks: { lines: string[], repeat: number }[], error?: string }}
 */
export function normalizeTabInput(raw) {
  if (!raw || typeof raw !== 'string') {
    return { normalized: '', blocks: [], error: 'TAB metni boş.' }
  }

  // 1. Normalize line endings
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // 2. Split into lines, trim trailing whitespace, drop empty lines
  const allLines = text.split('\n').map((l) => l.replace(/[ \t]+$/g, ''))

  // 3. Detect tab lines (start with a string letter, optionally after whitespace)
  // Non-tab lines (lyrics, [Intro], blank) are separators between blocks.
  const blocks = []
  let current = null
  let currentRepeat = 1

  for (const line of allLines) {
    if (line.trim() === '') {
      // Blank line ends the current block
      if (current && current.length > 0) {
        blocks.push({ lines: current, repeat: currentRepeat })
        current = null
        currentRepeat = 1
      }
      continue
    }

    const m = line.match(STRING_LETTER_RE)
    if (!m) {
      // Non-tab line ends the current block
      if (current && current.length > 0) {
        blocks.push({ lines: current, repeat: currentRepeat })
        current = null
        currentRepeat = 1
      }
      continue
    }

    const letterLower = m[1].toLowerCase()

    // This is a tab line. Strip line-end annotations BEFORE storing.
    const cleaned = stripLineEndAnnotations(line)
    // Detect repeat mark on this cleaned line
    const repeatMatch = line.match(/x\s*(\d+)\s*$/i)
    if (repeatMatch) {
      const n = parseInt(repeatMatch[1], 10)
      if (n >= 1 && n <= 8) currentRepeat = n
    }

    // If we already have a complete 6-line block and this line starts a new block
    // (letter e/E at the top of a new 6-line group), begin a new block.
    // Blocks may be adjacent without blank-line separators.
    if (current && current.length >= 6 && letterLower === 'e') {
      blocks.push({ lines: current, repeat: currentRepeat })
      current = null
      currentRepeat = 1
    }

    if (!current) current = []
    current.push(cleaned)
  }
  if (current && current.length > 0) {
    blocks.push({ lines: current, repeat: currentRepeat })
  }

  // 4. Validate each block has exactly 6 lines in the right order.
  // String letters are matched case-insensitively; the position in the block
  // determines the actual string (0=e/high E, 5=E/low E).
  const validBlocks = []
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (b.lines.length < 6) {
      return { normalized: '', blocks: [], error: `${i + 1}. TAB bloğunda 6 tel satırı bulunamadı (yalnızca ${b.lines.length} satır).` }
    }
    // Take the first 6 lines; validate the string order (case-insensitive)
    const first6 = b.lines.slice(0, 6)
    for (let s = 0; s < 6; s++) {
      const lm = first6[s].match(STRING_LETTER_RE)
      if (!lm || lm[1].toLowerCase() !== BLOCK_STRING_ORDER[s].toLowerCase()) {
        return {
          normalized: '',
          blocks: [],
          error: `${i + 1}. TAB bloğunun ${s + 1}. satırı "${BLOCK_STRING_ORDER[s]}" teli olmalıdır.`,
        }
      }
      // Normalize the string letter to the correct case based on position.
      // Replace the matched letter with the canonical BLOCK_STRING_ORDER letter.
      first6[s] = first6[s].replace(STRING_LETTER_RE, BLOCK_STRING_ORDER[s])
    }
    validBlocks.push({ lines: first6, repeat: b.repeat })
  }

  if (validBlocks.length === 0) {
    return { normalized: '', blocks: [], error: 'Geçerli bir 6 telli TAB bloğu bulunamadı.' }
  }

  // 5. Build normalized text
  const normalized = validBlocks
    .map((b) => b.lines.join('\n'))
    .join('\n\n')

  return { normalized, blocks: validBlocks }
}

// Strip line-end annotations: ")", "x2", "x3", "(x2)" etc.
// Preserves the TAB body including real "x" muted notes inside the line.
function stripLineEndAnnotations(line) {
  // Remove trailing ")" characters and repeat marks like "x2", "x3", "(x2)"
  // We only strip from the end of the line, after the TAB content.
  // Pattern: optional spaces, then any combination of ) and xN marks at the very end.
  // We must NOT strip "x" that appears inside the TAB body (e.g., "e|--x--|").
  // Strategy: find the last "|" or the end of the dashes/digits body.
  // Simpler: strip trailing ")" and trailing "xN" only if preceded by space or ")".
  let result = line

  // Remove trailing whitespace
  result = result.replace(/[ \t]+$/g, '')

  // Remove trailing repeat marks: "x2", "x3", "(x2)", "x2)" etc.
  // Only at the very end, and only if preceded by a non-digit, non-"|" character
  // (so we don't strip "12" from a fret or "x" from inside the tab body).
  result = result.replace(/[\s)]*(\(?\s*x\s*\d+\s*\)?\s*\)*\s*)$/i, '')

  // Remove trailing ")" characters that remain (line-end markers like "  )")
  // Only strip if they are preceded by whitespace or are at the end after content
  result = result.replace(/[ \t]*\)+[ \t]*$/g, '')

  // Final trim
  result = result.replace(/[ \t]+$/g, '')

  return result
}

// Parse a single tab line.
// "e|-----0-------|" -> { string: 'e', frets: Map<colIndex, fretString> }
// "e-----0-------"  -> { string: 'e', frets: Map<colIndex, fretString> }
// The separator (| or :) is optional. Dashes are preserved as column positions.
function parseTabLine(line) {
  // Match: optional leading whitespace, one of e/B/G/D/A/E, then an OPTIONAL single | or : separator.
  const match = line.match(/^\s*([eBGDAE])\s*([|:])?/)
  if (!match) return null

  const stringLetter = match[1]
  // Body starts right after the separator (if present), or right after the string letter.
  let body = line.slice(match[0].length)
  const closingBar = body.search(/[|:]/)
  if (closingBar !== -1) body = body.slice(0, closingBar)

  // Walk the body and record fret numbers at their column index.
  // Multi-digit frets (10, 12) occupy multiple columns but are stored once at the first column.
  const frets = new Map()
  let i = 0
  while (i < body.length) {
    const ch = body[i]
    if (/[0-9]/.test(ch)) {
      let num = ch
      let j = i + 1
      while (j < body.length && /[0-9]/.test(body[j])) {
        num += body[j]
        j++
      }
      frets.set(i, num)
      i = j
    } else {
      // dashes, spaces, "x" (muted note), and any non-digit are column fillers
      i++
    }
  }

  return { string: stringLetter, frets }
}

// Parse the full tab text into an array of parsed string-lines (only valid tab lines).
export function parseTab(text) {
  const lines = text.split(/\r?\n/)
  const parsed = []
  for (const line of lines) {
    const p = parseTabLine(line)
    if (p) parsed.push(p)
  }
  return parsed
}

// Group parsed lines into 6-line blocks (one per string: e, B, G, D, A, E).
// We group by detecting when the "e" string appears again (start of a new block).
function groupBlocks(parsedLines) {
  const blocks = []
  let current = null
  for (const p of parsedLines) {
    if (p.string === 'e') {
      if (current) blocks.push(current)
      current = [p]
    } else {
      if (current) current.push(p)
      else current = [p]
    }
  }
  if (current) blocks.push(current)
  return blocks
}

// For a block, read column by column (left to right = time order).
function blockToPhrases(block) {
  const phrases = []
  const maxCol = Math.max(...block.map((c) => (c.frets.size > 0 ? Math.max(...c.frets.keys()) : 0)), 0)

  for (let col = 0; col <= maxCol; col++) {
    const hits = []
    for (const line of block) {
      if (line.frets.has(col)) {
        hits.push({ string: line.string, fret: line.frets.get(col) })
      }
    }
    if (hits.length > 0) {
      phrases.push(columnToPhrase(hits))
    }
  }
  return phrases
}

function columnToPhrase(hits) {
  const sorted = [...hits].sort((a, b) => STRING_ORDER.indexOf(a.string) - STRING_ORDER.indexOf(b.string))
  const parts = sorted.map((h) => `${STRING_NAMES[h.string]} tel ${fretToText(h.fret)}`)
  if (parts.length === 1) return parts[0]
  return parts.slice(0, -1).join(', ') + ' ve ' + parts[parts.length - 1]
}

// Main entry: convert tab text to Turkish spoken text.
// Uses normalizeTabInput for safe pre-processing, then applies repeat counts.
export function tabToTurkish(text) {
  const { normalized, blocks, error } = normalizeTabInput(text)
  if (error) return ''

  const allPhrases = []
  for (const block of blocks) {
    const parsed = block.lines.map(parseTabLine).filter(Boolean)
    if (parsed.length === 0) continue
    const grouped = groupBlocks(parsed)
    for (let r = 0; r < block.repeat; r++) {
      for (const grp of grouped) {
        allPhrases.push(...blockToPhrases(grp))
      }
    }
  }
  return allPhrases.join('. ') + (allPhrases.length > 0 ? '.' : '')
}

// --- Note frequency calculation ---
const OPEN_STRING_FREQ = {
  e: 329.63, // E4
  B: 246.94, // B3
  G: 196.00, // G3
  D: 146.83, // D3
  A: 110.00, // A2
  E: 82.41,  // E2
}

export function noteFrequency(stringLetter, fret) {
  const base = OPEN_STRING_FREQ[stringLetter]
  if (!base) return null
  const n = parseInt(fret, 10)
  if (Number.isNaN(n)) return null
  return base * Math.pow(2, n / 12)
}

// Convert tab text into a list of "notes", where each note is a list of
// simultaneous (string, fret, frequency) hits at one time column.
// Uses normalizeTabInput and applies repeat counts.
export function tabToNotes(text) {
  const { normalized, blocks, error } = normalizeTabInput(text)
  if (error) return []

  const notes = []
  for (const block of blocks) {
    const parsed = block.lines.map(parseTabLine).filter(Boolean)
    if (parsed.length === 0) continue
    const grouped = groupBlocks(parsed)
    for (let r = 0; r < block.repeat; r++) {
      for (const grp of grouped) {
        const maxCol = Math.max(
          ...grp.map((c) => (c.frets.size > 0 ? Math.max(...c.frets.keys()) : 0)),
          0
        )
        for (let col = 0; col <= maxCol; col++) {
          const hits = []
          for (const line of grp) {
            if (line.frets.has(col)) {
              const fret = line.frets.get(col)
              const freq = noteFrequency(line.string, fret)
              if (freq) hits.push({ string: line.string, fret, freq })
            }
          }
          if (hits.length > 0) notes.push(hits)
        }
      }
    }
  }
  return notes
}
