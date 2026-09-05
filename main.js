// SesliTab — production entry point.
// The former teacher/keypad/score-workspace presentation is intentionally not
// initialized here. Its immutable revision/quality services remain in the repo
// for the Smoosic save/revalidation bridge, while the visible editor is Smoosic.

import './src/style.css'
import './src/discovery.css'
import './src/package11TunerUi.css'
import './src/stageKTunerPresentation.css'
import './src/stageS04MiniTuner.css'
import './src/appShell.css'
import './src/stageDQualityOverlay.css'
import './src/stageJDiscoveryPresentation.css'
import './src/stageS13SmoosicTransitionCleanup.css'
import './src/smoosicEditorTab.css'

import './src/app.js'
import './src/package3Ui.js'
import './src/stageCNoteSelectionUi.js'
import './src/stageDQualityOverlayUi.js'
import './src/package4Ui.js'
import './src/package5Ui.js'
import './src/discoveryUi.js'
import './src/package11TunerUi.js'
import './src/appShell.js'

import { initStageJDiscoveryPresentation } from './src/stageJDiscoveryPresentation.js'
import { initStageKTunerPresentation } from './src/stageKTunerPresentation.js'
import { initStageS04MiniTunerUi } from './src/stageS04MiniTunerUi.js'
import { initSmoosicEditorTab } from './src/smoosicEditorTabUi.js'

if (typeof document !== 'undefined') {
  initStageJDiscoveryPresentation(document)
  initStageKTunerPresentation(document)
  initStageS04MiniTunerUi(document)
  initSmoosicEditorTab(document)
}
