// Pixel-level image analysis for the PDF rhythm reading engine.
// All functions operate on ImageData-like objects { data, width, height }
// where data is a Uint8ClampedArray of RGBA pixels.

export function isDark(data, idx) {
  const lum = (data[idx] + data[idx + 1] + data[idx + 2]) / 3
  return lum < 110
}

// Count dark pixels in a row across the full width.
function rowDarkCount(data, width, y) {
  let count = 0
  for (let x = 0; x < width; x++) {
    if (isDark(data, (y * width + x) * 4)) count++
  }
  return count
}

function colDarkCount(data, width, height, x) {
  let count = 0
  for (let y = 0; y < height; y++) {
    if (isDark(data, (y * width + x) * 4)) count++
  }
  return count
}

// Detect horizontal lines: rows where a high fraction of pixels are dark.
// Returns array of { y, thickness, strength } sorted by y.
export function detectHorizontalLines(img, width, height, threshold = 0.55) {
  const data = img.data
  const rows = []
  for (let y = 0; y < height; y++) {
    const count = rowDarkCount(data, width, y)
    const ratio = count / width
    if (ratio > threshold) rows.push({ y, ratio })
  }
  // Group consecutive rows into single lines
  const lines = []
  let group = []
  for (let i = 0; i < rows.length; i++) {
    if (group.length === 0 || rows[i].y === group[group.length - 1].y + 1) {
      group.push(rows[i])
    } else {
      lines.push(makeLine(group))
      group = [rows[i]]
    }
  }
  if (group.length > 0) lines.push(makeLine(group))
  return lines
}

function makeLine(group) {
  return {
    y: Math.round(group.reduce((s, r) => s + r.y, 0) / group.length),
    thickness: group.length,
    strength: group.reduce((s, r) => s + r.ratio, 0) / group.length,
  }
}

// Detect vertical lines: columns where a high fraction of pixels are dark.
// Returns array of { x, thickness, strength } sorted by x.
export function detectVerticalLines(img, width, height, threshold = 0.6) {
  const data = img.data
  const cols = []
  for (let x = 0; x < width; x++) {
    const count = colDarkCount(data, width, height, x)
    const ratio = count / height
    if (ratio > threshold) cols.push({ x, ratio })
  }
  const lines = []
  let group = []
  for (let i = 0; i < cols.length; i++) {
    if (group.length === 0 || cols[i].x === group[group.length - 1].x + 1) {
      group.push(cols[i])
    } else {
      lines.push(makeVLine(group))
      group = [cols[i]]
    }
  }
  if (group.length > 0) lines.push(makeVLine(group))
  return lines
}

function makeVLine(group) {
  return {
    x: Math.round(group.reduce((s, c) => s + c.x, 0) / group.length),
    thickness: group.length,
    strength: group.reduce((s, c) => s + c.ratio, 0) / group.length,
  }
}

// Cluster horizontal lines into staves by gaps.
// Returns groups: array of arrays of line objects.
export function clusterLinesByGap(lines, gapMultiplier = 2.2) {
  if (lines.length === 0) return []
  const sorted = [...lines].sort((a, b) => a.y - b.y)
  const gaps = []
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(sorted[i].y - sorted[i - 1].y)
  }
  const medianGap = gaps.length > 0 ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 10
  const groups = []
  let current = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].y - sorted[i - 1].y
    if (gap > medianGap * gapMultiplier) {
      groups.push(current)
      current = [sorted[i]]
    } else {
      current.push(sorted[i])
    }
  }
  groups.push(current)
  return groups
}

// Classify line groups into staves (5 lines) and TAB staves (6 lines).
// Returns array of { type: 'staff'|'tab', lines, top, bottom, spacing }
export function classifyLineGroups(groups) {
  const result = []
  for (const g of groups) {
    if (g.length === 5) {
      result.push(makeSystemPart('staff', g))
    } else if (g.length === 6) {
      result.push(makeSystemPart('tab', g))
    } else if (g.length >= 4 && g.length <= 7) {
      result.push(makeSystemPart(g.length === 5 ? 'staff' : 'tab', g))
    }
  }
  return result
}

function makeSystemPart(type, lines) {
  const ys = lines.map((l) => l.y).sort((a, b) => a - b)
  const top = ys[0]
  const bottom = ys[ys.length - 1]
  const spacings = []
  for (let i = 1; i < ys.length; i++) spacings.push(ys[i] - ys[i - 1])
  const avgSpacing = spacings.reduce((s, v) => s + v, 0) / (spacings.length || 1)
  return { type, lines, top, bottom, spacing: avgSpacing }
}

// Pair staff + TAB parts into systems (staff above, TAB below).
// Returns array of { staff, tab } systems.
export function pairSystems(parts) {
  const systems = []
  const used = new Set()
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].type === 'tab' && !used.has(i)) {
      let bestStaff = -1
      let bestDist = Infinity
      for (let j = 0; j < parts.length; j++) {
        if (parts[j].type === 'staff' && !used.has(j)) {
          const dist = parts[i].top - parts[j].bottom
          if (dist > 0 && dist < bestDist) {
            bestDist = dist
            bestStaff = j
          }
        }
      }
      if (bestStaff >= 0) {
        used.add(bestStaff)
        used.add(i)
        systems.push({ staff: parts[bestStaff], tab: parts[i] })
      } else {
        systems.push({ staff: null, tab: parts[i] })
      }
    }
  }
  return systems
}

// Detect bar lines within a system's vertical extent.
// Returns array of x positions.
export function detectBarLines(img, system, width) {
  const data = img.data
  const top = system.staff ? system.staff.top : system.tab.top
  const bottom = system.tab.bottom
  const height = bottom - top + 1
  if (height <= 0) return []
  const xPositions = []
  let inBar = false
  let barStart = 0
  for (let x = 0; x < width; x++) {
    let dark = 0
    for (let y = top; y <= bottom; y++) {
      if (isDark(data, (y * width + x) * 4)) dark++
    }
    const ratio = dark / height
    if (ratio > 0.7) {
      if (!inBar) { inBar = true; barStart = x }
    } else {
      if (inBar) {
        const barX = Math.round((barStart + x - 1) / 2)
        const barThickness = x - barStart
        if (barThickness <= 6 && barX > 20) xPositions.push(barX)
        inBar = false
      }
    }
  }
  if (inBar) {
    const barX = Math.round((barStart + width - 1) / 2)
    if (barX > 20) xPositions.push(barX)
  }
  return xPositions
}

// Detect noteheads in a region of the classic staff.
// Returns array of { x, y, width, height, filled, confidence }
export function detectNoteheads(img, region, width) {
  const data = img.data
  const { x1, y1, x2, y2 } = region
  const w = x2 - x1
  const h = y2 - y1
  if (w <= 0 || h <= 0) return []
  const mask = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcIdx = ((y1 + y) * width + (x1 + x)) * 4
      if (isDark(data, srcIdx)) mask[y * w + x] = 1
    }
  }
  const visited = new Uint8Array(w * h)
  const components = []
  const stack = []
  for (let start = 0; start < w * h; start++) {
    if (mask[start] && !visited[start]) {
      stack.length = 0
      stack.push(start)
      let minX = w, maxX = 0, minY = h, maxY = 0, count = 0
      while (stack.length > 0) {
        const p = stack.pop()
        if (visited[p]) continue
        visited[p] = 1
        const px = p % w
        const py = (p / w) | 0
        count++
        if (px < minX) minX = px
        if (px > maxX) maxX = px
        if (py < minY) minY = py
        if (py > maxY) maxY = py
        if (px > 0 && mask[p - 1] && !visited[p - 1]) stack.push(p - 1)
        if (px < w - 1 && mask[p + 1] && !visited[p + 1]) stack.push(p + 1)
        if (py > 0 && mask[p - w] && !visited[p - w]) stack.push(p - w)
        if (py < h - 1 && mask[p + w] && !visited[p + w]) stack.push(p + w)
      }
      const cw = maxX - minX + 1
      const ch = maxY - minY + 1
      const area = cw * ch
      const fill = count / area
      if (cw >= 6 && cw <= 40 && ch >= 4 && ch <= 30 && count >= 20 && count <= 1200) {
        components.push({
          x: x1 + minX,
          y: y1 + minY,
          width: cw,
          height: ch,
          pixelCount: count,
          fillRatio: fill,
          filled: fill > 0.55,
        })
      }
    }
  }
  const merged = mergeClose(components, 4)
  return merged
}

function mergeClose(components, maxGap) {
  const result = []
  const used = new Array(components.length).fill(false)
  for (let i = 0; i < components.length; i++) {
    if (used[i]) continue
    let cur = { ...components[i] }
    used[i] = true
    for (let j = i + 1; j < components.length; j++) {
      if (used[j]) continue
      const c = components[j]
      const xOverlap = cur.x + cur.width + maxGap >= c.x && c.x + c.width + maxGap >= cur.x
      const yOverlap = cur.y <= c.y + c.height + 2 && c.y <= cur.y + cur.height + 2
      if (xOverlap && yOverlap && Math.abs((cur.x + cur.width / 2) - (c.x + c.width / 2)) < 25) {
        cur = {
          x: Math.min(cur.x, c.x),
          y: Math.min(cur.y, c.y),
          width: Math.max(cur.x + cur.width, c.x + c.width) - Math.min(cur.x, c.x),
          height: Math.max(cur.y + cur.height, c.y + c.height) - Math.min(cur.y, c.y),
          pixelCount: cur.pixelCount + c.pixelCount,
          fillRatio: (cur.pixelCount + c.pixelCount) / (Math.max(cur.x + cur.width, c.x + c.width) - Math.min(cur.x, c.x)) / (Math.max(cur.y + cur.height, c.y + c.height) - Math.min(cur.y, c.y)),
          filled: true,
        }
        used[j] = true
      }
    }
    result.push(cur)
  }
  return result
}

// Detect a stem attached to a notehead.
// Returns { hasStem, direction: 'up'|'down', stemLength, stemX }
export function detectStem(img, notehead, width) {
  const data = img.data
  const cx = notehead.x + Math.round(notehead.width / 2)
  const top = notehead.y
  const bottom = notehead.y + notehead.height
  let upLen = 0
  let upX = cx
  for (let y = top - 1; y > top - 60; y--) {
    if (y < 0) break
    let found = false
    for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx
      if (x < 0 || x >= width) continue
      if (isDark(data, (y * width + x) * 4)) { found = true; upX = x; break }
    }
    if (found) upLen++
    else if (upLen > 0) break
  }
  let downLen = 0
  let downX = cx
  for (let y = bottom + 1; y < bottom + 60; y++) {
    if (y >= img.height) break
    let found = false
    for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx
      if (x < 0 || x >= width) continue
      if (isDark(data, (y * width + x) * 4)) { found = true; downX = x; break }
    }
    if (found) downLen++
    else if (downLen > 0) break
  }
  if (upLen > 5 && upLen >= downLen) {
    return { hasStem: true, direction: 'up', stemLength: upLen, stemX: upX }
  }
  if (downLen > 5) {
    return { hasStem: true, direction: 'down', stemLength: downLen, stemX: downX }
  }
  return { hasStem: false, direction: null, stemLength: 0, stemX: cx }
}

// Detect a dot (augmentation dot) to the right of a notehead.
export function detectDot(img, notehead, width) {
  const data = img.data
  const dotXStart = notehead.x + notehead.width + 2
  const dotXEnd = dotXStart + 12
  const cy = notehead.y + Math.round(notehead.height / 2)
  for (let x = dotXStart; x < dotXEnd && x < width; x++) {
    let count = 0
    for (let dy = -3; dy <= 3; dy++) {
      const y = cy + dy
      if (y < 0 || y >= img.height) continue
      if (isDark(data, (y * width + x) * 4)) count++
    }
    if (count >= 3) return true
  }
  return false
}

// Detect a flag at the end of a stem.
// Returns { hasFlag, flagCount }
export function detectFlag(img, stem, width) {
  if (!stem.hasStem) return { hasFlag: false, flagCount: 0 }
  const data = img.data
  const stemEndY = stem.direction === 'up' ? stem.stemY - stem.stemLength : stem.stemY + stem.stemLength
  const stemX = stem.stemX
  let flagCount = 0
  // Look for flag-like dark clusters at the stem end
  for (let layer = 0; layer < 3; layer++) {
    const yOffset = stem.direction === 'up' ? stemEndY - layer * 7 : stemEndY + layer * 7
    if (yOffset < 0 || yOffset >= img.height) break
    let darkPixels = 0
    for (let dx = 0; dx < 12; dx++) {
      const x = stemX + dx
      if (x < 0 || x >= width) continue
      if (isDark(data, (yOffset * width + x) * 4)) darkPixels++
    }
    if (darkPixels >= 4) flagCount++
    else break
  }
  return { hasFlag: flagCount > 0, flagCount }
}

// Detect a beam connecting two or more stems.
// stems: array of { stemX, stemY, direction, stemLength }
// Returns array of beam groups: [[stemIndex, ...], ...]
export function detectBeams(img, stems, width) {
  const data = img.data
  const beams = []
  const used = new Set()
  for (let i = 0; i < stems.length; i++) {
    if (used.has(i) || !stems[i].hasStem) continue
    const group = [i]
    used.add(i)
    const s1 = stems[i]
    for (let j = i + 1; j < stems.length; j++) {
      if (used.has(j) || !stems[j].hasStem) continue
      const s2 = stems[j]
      if (s1.direction !== s2.direction) continue
      const xDist = Math.abs(s2.stemX - s1.stemX)
      if (xDist > 80 || xDist < 5) continue
      // Check for a horizontal dark band between the two stem ends
      const y1 = s1.direction === 'up' ? s1.stemY - s1.stemLength : s1.stemY + s1.stemLength
      const y2 = s2.direction === 'up' ? s2.stemY - s2.stemLength : s2.stemY + s2.stemLength
      const avgY = Math.round((y1 + y2) / 2)
      let beamPixels = 0
      for (let x = s1.stemX; x <= s2.stemX; x++) {
        let found = false
        for (let dy = -2; dy <= 2; dy++) {
          const y = avgY + dy
          if (y < 0 || y >= img.height) continue
          if (isDark(data, (y * width + x) * 4)) { found = true; break }
        }
        if (found) beamPixels++
      }
      const span = Math.abs(s2.stemX - s1.stemX)
      if (beamPixels > span * 0.6) {
        group.push(j)
        used.add(j)
      }
    }
    if (group.length > 1) beams.push(group)
  }
  return beams
}

// Detect rest symbols in a region.
// Returns array of { x, y, type, beats, confidence }
export function detectRests(img, region, width) {
  const data = img.data
  const { x1, y1, x2, y2 } = region
  const rests = []
  // Scan for rest-like shapes: small dark clusters that aren't noteheads
  const w = x2 - x1
  const h = y2 - y1
  if (w <= 0 || h <= 0) return rests
  // Quarter rest: a zigzag/S shape, roughly 3-5px wide, 8-15px tall
  // Eighth rest: a flag-like shape with a stem
  // We use a simplified approach: find dark clusters and classify by shape
  const mask = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcIdx = ((y1 + y) * width + (x1 + x)) * 4
      if (isDark(data, srcIdx)) mask[y * w + x] = 1
    }
  }
  const visited = new Uint8Array(w * h)
  const stack = []
  for (let start = 0; start < w * h; start++) {
    if (mask[start] && !visited[start]) {
      stack.length = 0
      stack.push(start)
      let minX = w, maxX = 0, minY = h, maxY = 0, count = 0
      while (stack.length > 0) {
        const p = stack.pop()
        if (visited[p]) continue
        visited[p] = 1
        const px = p % w
        const py = (p / w) | 0
        count++
        if (px < minX) minX = px
        if (px > maxX) maxX = px
        if (py < minY) minY = py
        if (py > maxY) maxY = py
        if (px > 0 && mask[p - 1] && !visited[p - 1]) stack.push(p - 1)
        if (px < w - 1 && mask[p + 1] && !visited[p + 1]) stack.push(p + 1)
        if (py > 0 && mask[p - w] && !visited[p - w]) stack.push(p - w)
        if (py < h - 1 && mask[p + w] && !visited[p + w]) stack.push(p + w)
      }
      const cw = maxX - minX + 1
      const ch = maxY - minY + 1
      // Rests are typically taller than wide, and smaller than noteheads
      if (cw >= 3 && cw <= 12 && ch >= 6 && ch <= 25 && count >= 8 && count <= 300) {
        const aspect = ch / cw
        let type = 'quarter'
        let beats = 1
        let confidence = 0.4
        if (aspect > 2.5 && ch > 12) {
          // Tall narrow shape — likely quarter or eighth rest
          type = 'quarter'
          beats = 1
          confidence = 0.5
        } else if (aspect > 1.5) {
          type = 'eighth'
          beats = 0.5
          confidence = 0.4
        } else if (cw > 8) {
          // Wide shape — could be half rest (sits on line) or whole rest (hangs from line)
          type = 'half'
          beats = 2
          confidence = 0.35
        }
        rests.push({
          x: x1 + minX + Math.round(cw / 2),
          y: y1 + minY,
          width: cw,
          height: ch,
          type,
          beats,
          confidence,
        })
      }
    }
  }
  return rests
}

// Detect a tie or slur connecting two noteheads.
// Returns { hasTie, startX, endX, y }
export function detectTie(img, nh1, nh2, width) {
  const data = img.data
  const x1 = nh1.x + nh1.width
  const x2 = nh2.x
  if (x2 <= x1) return { hasTie: false }
  const midY = Math.min(nh1.y, nh2.y) - 8
  let tiePixels = 0
  for (let x = x1; x < x2; x++) {
    let found = false
    for (let dy = -3; dy <= 3; dy++) {
      const y = midY + dy
      if (y < 0 || y >= img.height) continue
      if (isDark(data, (y * width + x) * 4)) { found = true; break }
    }
    if (found) tiePixels++
  }
  const span = x2 - x1
  return { hasTie: tiePixels > span * 0.4, startX: x1, endX: x2, y: midY }
}
