// Presentation only: select existing panels without remounting their owners.
const tools = ['assignment', 'guitar-tab', 'violin']
const boundButtons = new WeakSet()

export function resetTeacherResultsPresentation(root) {
  const persistent = Boolean(root.getElementById('teacher-tools-navigation'))
  const results = root.getElementById('results-section')
  if (results) results.hidden = !persistent
  if (persistent) {
    // The existing Smoosic source observer must see an empty source after reset.
    const source = root.getElementById('xml-output')
    if (source) source.textContent = ''
  }
}

export function activateTeacherTool(root, name) {
  if (!tools.includes(name)) return false
  const panel = root.getElementById(`tab-${name}`)
  if (!panel) return false
  selectTeacherTool(root, name)
  const score = root.getElementById('tab-score-view')
  if (score) score.hidden = true
  const scoreButton = root.getElementById('result-score-view-btn')
  scoreButton?.setAttribute('aria-selected', 'false')
  scoreButton?.classList?.remove('active')
  const results = root.getElementById('results-section')
  if (results) results.hidden = false
  const xml = root.getElementById('tab-xml')
  if (xml) xml.hidden = false
  return true
}

// The existing score-view is also a reachable result consumer. It must not
// leave a teacher tab selected while displaying a different panel.
export function clearTeacherToolSelection(root) {
  if (!root.getElementById('teacher-tools-navigation')) return
  selectTeacherTool(root, null)
  const xml = root.getElementById('tab-xml')
  if (xml) xml.hidden = false
}

function selectTeacherTool(root, name) {
  for (const tool of tools) {
    const selected = tool === name
    const button = root.getElementById(`result-${tool}-btn`)
    button?.setAttribute('aria-selected', String(selected))
    button?.setAttribute('tabindex', selected || (!name && tool === 'assignment') ? '0' : '-1')
    button?.classList?.toggle('active', selected)
    const target = root.getElementById(`tab-${tool}`)
    if (target) target.hidden = !selected
  }
}

export function bindTeacherToolsNavigation(root) {
  if (!root.getElementById('teacher-tools-navigation')) return
  for (const name of tools) {
    const button = root.getElementById(`result-${name}-btn`)
    if (!button || boundButtons.has(button)) continue
    boundButtons.add(button)
    button.addEventListener('click', () => activateTeacherTool(root, name))
    button.addEventListener('keydown', event => {
      let index = tools.indexOf(name)
      if (event.key === 'ArrowRight') index = (index + 1) % tools.length
      else if (event.key === 'ArrowLeft') index = (index + tools.length - 1) % tools.length
      else if (event.key === 'Home') index = 0
      else if (event.key === 'End') index = tools.length - 1
      else return
      const next = tools[index]
      if (activateTeacherTool(root, next)) {
        event.preventDefault()
        root.getElementById(`result-${next}-btn`)?.focus()
      }
    })
  }
}
