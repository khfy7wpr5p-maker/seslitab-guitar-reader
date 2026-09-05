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
import './src/stageS12MobileProductionAcceptance.css'
import './src/stageS12MobileScoreTools.css'
import './src/stageS12RendererSessionRecovery.css'
import './src/stageJDiscoveryPresentation.css'
import './src/stagePrCKeypad.css'
import './src/flatTeacherCorrectionUi.css'
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
import { initStageS12MobileProductionAcceptanceUi } from './src/stageS12MobileProductionAcceptanceUi.js'
import { initStageS12RendererSessionRecoveryUi } from './src/stageS12RendererSessionRecoveryUi.js'
import { initStageS12MobileScoreToolsUi } from './src/stageS12MobileScoreToolsUi.js'
import { initStagePrBEditorSelectionUi } from './src/stagePrBEditorSelectionUi.js'
import { initStagePrDKeypadIntegrationUi } from './src/stagePrDKeypadIntegrationUi.js'
import { initStageJDiscoveryPresentation } from './src/stageJDiscoveryPresentation.js'
import { initStageKTunerPresentation } from './src/stageKTunerPresentation.js'
import { initStageS04MiniTunerUi } from './src/stageS04MiniTunerUi.js'
import { initStageS05ScoreWorkspaceUi } from './src/stageS05ScoreWorkspaceUi.js'
import { initStageS06ExactSelectionUi } from './src/stageS06ExactSelectionUi.js'
import { initStageS07InlineTeacherInspectorUi } from './src/stageS07InlineTeacherInspectorUi.js'
import { initStageS07VerifiedSelectionProjection } from './src/stageS07VerifiedSelectionProjection.js'
import { initStageS08ScoreQualityOverlay } from './src/stageS08ScoreQualityOverlayUi.js'
import { initStageLShareUi } from './src/stageLShareUi.js'
import { initFlatTeacherCorrectionUi } from './src/flatTeacherCorrectionUi.js'

if (typeof document !== 'undefined') {
  initStageJDiscoveryPresentation(document)
  initStageKTunerPresentation(document)
  initStageS04MiniTunerUi(document)
  initStageS05ScoreWorkspaceUi(document)
  initStageS06ExactSelectionUi(document)
  initStageS07InlineTeacherInspectorUi(document)
  initStageS07VerifiedSelectionProjection(document)
  initStageS08ScoreQualityOverlay(document)
  // PR-B installs the current-render → canonical → current Editor manifest
  // selection gate first. Its capture handler stops the former direct Package 3
  // selection path, while the S12 layer below continues to own mobile workspace
  // presentation/recovery behavior without becoming a second write authority.
  initStagePrBEditorSelectionUi(document)
  // PR-D mounts the Editor Core keypad only after the exact selection gate.
  // It owns keypad writes, immutable product revision audit, revalidation,
  // rerender and post-rerender rebind. Legacy edit controls are retired while
  // this path is active; teacher approval remains a separate action.
  initStagePrDKeypadIntegrationUi(document)
  // S12 adds mobile pointer/touch delivery, post-input workspace focus, and
  // relocates the existing primary playback sections beside the score. It does
  // not change renderer/canonical authority or quality-gate decisions.
  initStageS12MobileProductionAcceptanceUi(document)
  // A renderer startup failure must not force a page reload or PDF re-upload.
  // This recovery layer retries only the existing score view from in-session
  // MusicXML and leaves OMR, canonical, revision and approval authority intact.
  initStageS12RendererSessionRecoveryUi(document)
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
  // Flat remains an isolated teacher-editing experiment. It reads the current
  // MusicXML and can export an edited copy, but it does not write canonical
  // revisions, OMR evidence, approval or quality state in this prototype.
  initFlatTeacherCorrectionUi(document)
  // The legacy compact note palette may still initialize for unrelated S12
  // orchestration, but PR-D CSS hides its write controls while the integrated
  // Editor keypad is mounted so it cannot become a second authority.
  initStageS12MobileScoreToolsUi(document)
  initStageLShareUi(document)
}
