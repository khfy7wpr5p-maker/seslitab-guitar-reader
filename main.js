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
import './src/teacherHomeworkUi.css'
import './src/teacherAuthSessionUi.css'

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
import { mountTeacherAssignmentProduction } from './src/teacherAssignmentProductionMount.js'
import { createTeacherAuthSessionController } from './src/teacherAuthSessionController.js'
import { mountTeacherAuthSessionUi } from './src/teacherAuthSessionUi.js'
import { mountTeacherStudentManagementProduction } from './src/teacherStudentManagementProductionMount.js'
import { installMusicXmlMxlInputBridge } from './src/musicXmlMxlInputBridge.js'

function envText(name) {
  const value = import.meta.env?.[name]
  return typeof value === 'string'
    ? value.trim()
    : ''
}

if (typeof document !== 'undefined') {
  installMusicXmlMxlInputBridge(document)
  initStageJDiscoveryPresentation(document)
  initStageKTunerPresentation(document)
  initStageS04MiniTunerUi(document)
  initSmoosicEditorTab(document)
  const authHost =
    document.getElementById(
      'teacher-auth-session-host',
    )
  const studentManagementHost =
    document.getElementById(
      'teacher-student-management-host',
    )
  const accountServiceBaseUrl =
    envText(
      'VITE_SESLITAB_ACCOUNT_SERVICE_API_URL',
    )
  let assignmentHandle = null
  let studentManagementHandle = null

  const controller =
    createTeacherAuthSessionController({
      root: document,
      onReady(connection) {
        assignmentHandle?.destroy()
        assignmentHandle =
          mountTeacherAssignmentProduction({
            root: document,
            composition:
              connection.composition,
          })

        studentManagementHandle?.destroy()
        studentManagementHandle = null
        if (studentManagementHost) {
          studentManagementHandle =
            mountTeacherStudentManagementProduction({
              root: document,
              host: studentManagementHost,
              baseUrl: accountServiceBaseUrl,
              getIdToken: connection.getIdToken,
            })
        }
      },
      onAuthorityRevoked() {
        assignmentHandle?.destroy()
        assignmentHandle = null
        studentManagementHandle?.destroy()
        studentManagementHandle = null
      },
    })

  if (authHost) {
    mountTeacherAuthSessionUi({
      root: document,
      host: authHost,
      controller,
    })
    void controller.start()
  }
}
