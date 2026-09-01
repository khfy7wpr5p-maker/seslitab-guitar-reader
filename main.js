// SesliTab — Vite entry point.
// Imports the main app module, package UI controllers, discovery UI, app shell, and styles.

import './src/style.css'
import './src/discovery.css'
import './src/package8TeacherUi.css'
import './src/stageATeacherPresentation.css'
import './src/package11TunerUi.css'
import './src/stageKTunerPresentation.css'
import './src/stageS04MiniTuner.css'
import './src/stageS05ScoreWorkspace.css'
import './src/stageS07InlineTeacherInspector.css'
import './src/stageLShareUi.css'
import './src/appShell.css'
import './src/mobileReviewUi.css'
import './src/stageDQualityOverlay.css'
import './src/stageEVisualNoteEditor.css'
import './src/stageFRevisionLifecycle.css'
import './src/stageIInstrumentProduct.css'
import './src/stageJDiscoveryPresentation.css'
import './src/app.js'
import './src/package3Ui.js'
import './src/stageCNoteSelectionUi.js'
import './src/stageDQualityOverlayUi.js'
import './src/package4Ui.js'
import './src/package5Ui.js'
import './src/package7Ui.js'
import './src/discoveryUi.js'
import './src/package8TeacherUi.js'
import './src/stageEVisualNoteEditorUi.js'
import './src/stageFRevisionLifecycleUi.js'
import './src/stageATeacherPresentation.js'
import './src/scoreViewUi.js'
import './src/package11TunerUi.js'
import './src/appShell.js'
import './src/reviewInspectorUi.js'
import { initStageIInstrumentProductUi } from './src/stageIInstrumentProductUi.js'
import { initStageJDiscoveryPresentation } from './src/stageJDiscoveryPresentation.js'
import { initStageKTunerPresentation } from './src/stageKTunerPresentation.js'
import { initStageS04MiniTunerUi } from './src/stageS04MiniTunerUi.js'
import { initStageS05ScoreWorkspaceUi } from './src/stageS05ScoreWorkspaceUi.js'
import { initStageS06ExactSelectionUi } from './src/stageS06ExactSelectionUi.js'
import { initStageS07InlineTeacherInspectorUi } from './src/stageS07InlineTeacherInspectorUi.js'
import { initStageS07VerifiedSelectionProjection } from './src/stageS07VerifiedSelectionProjection.js'
import { initStageLShareUi } from './src/stageLShareUi.js'

if (typeof document !== 'undefined') {
  initStageIInstrumentProductUi(document)
  initStageJDiscoveryPresentation(document)
  initStageKTunerPresentation(document)
  initStageS04MiniTunerUi(document)
  initStageS05ScoreWorkspaceUi(document)
  initStageS06ExactSelectionUi(document)
  initStageS07InlineTeacherInspectorUi(document)
  initStageS07VerifiedSelectionProjection(document)
  initStageLShareUi(document)
}
