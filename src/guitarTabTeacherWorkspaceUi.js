const STRING_LABELS = Object.freeze([
  '1 · E4',
  '2 · B3',
  '3 · G3',
  '4 · D3',
  '5 · A2',
  '6 · E2',
])

function createElement(root, tagName, options = {}) {
  const element = root.createElement(tagName)
  if (options.id) element.id = options.id
  if (options.className) element.className = options.className
  if (options.textContent !== undefined) element.textContent = options.textContent
  return element
}

export function ensureGuitarTabTeacherWorkspace(root, panel) {
  if (
    !root
    || typeof root.getElementById !== 'function'
    || typeof root.createElement !== 'function'
    || !panel?.appendChild
  ) {
    return null
  }

  const existing = root.getElementById('guitar-tab-teacher-workspace')
  if (existing) return existing

  const workspace = createElement(root, 'section', {
    id: 'guitar-tab-teacher-workspace',
    className: 'guitar-tab-teacher-workspace',
  })
  workspace.setAttribute('aria-labelledby', 'guitar-tab-workspace-heading')

  const heading = createElement(root, 'h3', {
    id: 'guitar-tab-workspace-heading',
    textContent: 'Gitar TAB çalışma alanı',
  })
  workspace.appendChild(heading)

  const sourceControls = createElement(root, 'div', {
    className: 'guitar-tab-source-controls',
  })
  const sourceLabel = createElement(root, 'label', {
    textContent: 'MusicXML yükle',
  })
  sourceLabel.setAttribute('for', 'guitar-tab-source-input')
  sourceControls.appendChild(sourceLabel)

  const sourceInput = createElement(root, 'input', {
    id: 'guitar-tab-source-input',
    className: 'guitar-tab-source-input',
  })
  sourceInput.type = 'file'
  sourceInput.setAttribute(
    'accept',
    '.xml,.musicxml,text/xml,application/xml,application/vnd.recordare.musicxml+xml',
  )
  sourceControls.appendChild(sourceInput)

  const resetButton = createElement(root, 'button', {
    id: 'guitar-tab-source-reset',
    className: 'guitar-tab-source-reset',
    textContent: 'Sıfırla',
  })
  resetButton.type = 'button'
  sourceControls.appendChild(resetButton)
  workspace.appendChild(sourceControls)

  const sourceStatus = createElement(root, 'div', {
    id: 'guitar-tab-source-status',
    className: 'guitar-tab-source-status',
    textContent: 'MusicXML yüklenmedi.',
  })
  sourceStatus.setAttribute('role', 'status')
  sourceStatus.setAttribute('aria-live', 'polite')
  workspace.appendChild(sourceStatus)

  const scoreRegion = createElement(root, 'section', {
    className: 'guitar-tab-score-region',
  })
  const scoreHeading = createElement(root, 'h4', {
    textContent: 'Nota görünümü',
  })
  scoreRegion.appendChild(scoreHeading)
  const scoreSurface = createElement(root, 'div', {
    id: 'guitar-tab-score-surface',
    className: 'guitar-tab-score-surface',
  })
  scoreSurface.setAttribute('aria-readonly', 'true')
  scoreSurface.setAttribute('aria-label', 'Yüklenen MusicXML için salt okunur nota görünümü')
  scoreRegion.appendChild(scoreSurface)
  workspace.appendChild(scoreRegion)

  const editorRegion = createElement(root, 'section', {
    className: 'guitar-tab-editor-region',
  })
  const editorHeading = createElement(root, 'h4', {
    textContent: '6 telli TAB çalışma alanı',
  })
  editorRegion.appendChild(editorHeading)
  const editorSurface = createElement(root, 'div', {
    id: 'guitar-tab-editor-surface',
    className: 'guitar-tab-editor-surface',
  })
  editorSurface.setAttribute('aria-label', 'Altı telli gitar TAB çalışma alanı')

  for (let index = 0; index < STRING_LABELS.length; index += 1) {
    const row = createElement(root, 'div', {
      className: 'guitar-tab-string-row',
      textContent: STRING_LABELS[index],
    })
    row.dataset.string = String(index + 1)
    editorSurface.appendChild(row)
  }

  editorRegion.appendChild(editorSurface)
  workspace.appendChild(editorRegion)
  panel.appendChild(workspace)
  return workspace
}
