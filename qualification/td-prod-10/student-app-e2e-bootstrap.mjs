import {
  createStudentSession,
} from "../../src/auth/session.js";
import {
  createBrowserConnectivityPort,
} from "../../src/offline/connectivityPort.js";
import {
  createIndexedDbOfflineRepository,
} from "../../src/offline/indexedDbOfflineRepository.js";
import {
  createSecureDeliveryOfflineReadService,
} from "../../src/offline/secureDeliveryOfflineReadService.js";
import {
  createForegroundSyncCoordinator,
} from "../../src/offline/syncCoordinator.js";
import {
  createStNotationAdapter,
} from "../../src/practice/notationAdapter.js";
import {
  createScoreFollowCoordinator,
} from "../../src/practice/scoreFollowCoordinator.js";
import {
  createViolinFollowCoordinator,
} from "../../src/practice/violinFollowCoordinator.js";
import {
  createNotationRuntimeLoader,
} from "../../src/practice/notationRuntimeLoader.js";
import {
  createPianoSampleBank,
} from "../../src/playback/pianoSampleBank.js";
import {
  createPlaybackPlanResolver,
} from "../../src/playback/playbackPlanResolver.js";
import {
  createStudentPlaybackPort,
} from "../../src/playback/studentPlaybackPort.js";
import {
  createWebAudioPianoEngine,
} from "../../src/playback/webAudioPianoEngine.js";
import {
  createStudentAppController,
} from "../../src/ui/studentAppController.js";
import {
  mountStudentApp,
} from "../../src/ui/mountStudentApp.js";
import {
  createViolinFingerboardPresentation,
} from "../../src/ui/violinFingerboard.js";
import {
  createTdProd10OnlineReadService,
  createTdProd10StatusServices,
  tdProd10CredentialsMatch,
  tdProd10Student,
} from "./td-prod-10-e2e-fixture-adapter.mjs";

const root = document.querySelector("#app");
if (root === null) {
  throw new Error(
    "TD-PROD-10 app root missing",
  );
}

const connectivityPort =
  createBrowserConnectivityPort();
const offlineRepository =
  createIndexedDbOfflineRepository({
    indexedDB: globalThis.indexedDB,
    dbName:
      "st-student-app-td-prod-10-e2e",
  });
const onlineReadService =
  createTdProd10OnlineReadService();
const student08ReadService =
  createSecureDeliveryOfflineReadService({
    onlineReadService,
    offlineRepository,
    connectivityPort,
    clock: () =>
      "2026-09-30T18:20:00.000Z",
  });

const notationRuntimeLoader =
  createNotationRuntimeLoader({
    bootstrapUrl:
      "/vendor/st-score-runtime/browser-bootstrap.mjs",
    vendorUrl:
      "/vendor/st-score-runtime/vendor/opensheetmusicdisplay.min.js",
  });
const notationAdapter =
  createStNotationAdapter({
    runtimeLoader:
      notationRuntimeLoader,
  });
const playbackPlanResolver =
  createPlaybackPlanResolver();
const sampleBank =
  createPianoSampleBank({
    manifestUrl:
      "./vendor/st-piano/runtime-manifest.json",
  });
await sampleBank.initialize().catch(
  () => false,
);

const AudioContextCtor =
  globalThis.AudioContext ??
  globalThis.webkitAudioContext;
const audioContextSupported =
  typeof AudioContextCtor === "function";
const playbackEngine =
  createWebAudioPianoEngine({
    audioContextFactory: () =>
      typeof AudioContextCtor === "function"
        ? new AudioContextCtor()
        : null,
    audioContextSupported,
    sampleBank,
  });
const playbackPort =
  createStudentPlaybackPort({
    playbackPlanResolver,
    engine: playbackEngine,
  });
const scoreFollowCoordinator =
  createScoreFollowCoordinator({
    notationAdapter,
    playbackPort,
  });
const violinFingerboardPresentation =
  createViolinFingerboardPresentation({
    root,
  });
const violinFollowCoordinator =
  createViolinFollowCoordinator({
    playbackPort,
    presentationPort:
      violinFingerboardPresentation,
  });

const {
  publicationStatusService,
  secureDeliveryStatusService,
} = createTdProd10StatusServices();
const syncCoordinator =
  createForegroundSyncCoordinator({
    offlineRepository,
    publicationStatusService,
    secureDeliveryStatusService,
    clock: () =>
      "2026-09-30T18:21:00.000Z",
  });

const controller =
  createStudentAppController({
    sharingService:
      Object.freeze({
        listPublicPool() {
          throw new Error(
            "TD-PROD-10 legacy sharing boundary used",
          );
        },
        listMyWork() {
          throw new Error(
            "TD-PROD-10 legacy sharing boundary used",
          );
        },
        getPracticeItem() {
          throw new Error(
            "TD-PROD-10 legacy sharing boundary used",
          );
        },
      }),
    student08ReadService,
    initialSession: null,
    notationAdapter,
    playbackPort,
    syncCoordinator,
  });

mountStudentApp({
  root,
  controller,
  notationAdapter,
  scoreFollowCoordinator,
  violinFollowCoordinator,
  connectivityPort,
  requestSignIn(credentials) {
    if (!tdProd10CredentialsMatch(credentials)) {
      throw new Error(
        "TD-PROD-10 credentials rejected",
      );
    }
    const student = tdProd10Student();
    return createStudentSession({
      studentId: student.studentId,
      email: student.email,
      displayName:
        student.displayName,
    });
  },
  requestSignOut() {
    return undefined;
  },
});

document.documentElement.setAttribute(
  "data-td-prod-10-e2e-ready",
  "true",
);
