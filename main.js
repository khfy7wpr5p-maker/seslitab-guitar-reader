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
import './src/stageS08ScoreQualityOverlay.css'
import './src/stageLShareUi.css'
import './src/appShell.css'
import './src/mobileReviewUi.css'
import './src/stageDQualityOverlay.css'
import './src/stageEVisualNoteEditor.css'
import './src/stageFRevisionLifecycle.css'
import './src/stageIInstrumentProduct.css'
import './src/stageS10EducationalChords.css'
import './src/stageS11TeacherWorkflow.css'
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
import { initStageS10EducationalChordsUi } from './src/stageS10EducationalChordsUi.js'
import { initStageS11TeacherWorkflowUi } from './src/stageS11TeacherWorkflowUi.js'
import { initStageJDiscoveryPresentation } from './src/stageJDiscoveryPresentation.js'
import { initStageKTunerPresentation } from './src/stageKTunerPresentation.js'
import { initStageS04MiniTunerUi } from './src/stageS04MiniTunerUi.js'
import { initStageS05ScoreWorkspaceUi } from './src/stageS05ScoreWorkspaceUi.js'
import { initStageS06ExactSelectionUi } from './src/stageS06ExactSelectionUi.js'
import { initStageS07InlineTeacherInspectorUi } from './src/stageS07InlineTeacherInspectorUi.js'
import { initStageS07VerifiedSelectionProjection } from './src/stageS07VerifiedSelectionProjection.js'
import { initStageS08ScoreQualityOverlay } from './src/stageS08ScoreQualityOverlayUi.js'
import { initStageLShareUi } from './src/stageLShareUi.js'

if (typeof document !== 'undefined') {
  initStageJDiscoveryPresentation(document)
  initStageKTunerPresentation(document)
  initStageS04MiniTunerUi(document)
  initStageS05ScoreWorkspaceUi(document)
  initStageS06ExactSelectionUi(document)
  initStageS07InlineTeacherInspectorUi(document)
  initStageS07VerifiedSelectionProjection(document)
  initStageS08ScoreQualityOverlay(document)
  // S09 rail is initialized only after the score workspace exists. Package 4/5
  // side-effect listeners still register earlier and synchronously render the
  // exact Package 3 snapshot before this rail mirrors their safe output.
  initStageIInstrumentProductUi(document)
  // S10 adopts the existing Package 7 source-only chord panel only after the
  // S05 workspace exists, then adds a clearly separate generic education list.
  initStageS10EducationalChordsUi(document)
  // S11 removes the duplicate technical teacher tab from the normal workflow
  // only after S07-S10 have established the score-centered product surfaces.
  initStageS11TeacherWorkflowUi(document)
  initStageLShareUi(document)
}
