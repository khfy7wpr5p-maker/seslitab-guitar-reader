import {
  TD_PROD_10_FIXTURE,
} from "./td-prod-10-generated-fixture.mjs";

function requireOnline() {
  if (globalThis.navigator?.onLine === false) {
    throw new Error(
      "TD-PROD-10 online provider called while offline",
    );
  }
}

function requireStudent(session) {
  if (
    session?.studentId !==
    TD_PROD_10_FIXTURE.student.studentId
  ) {
    throw new Error(
      "TD-PROD-10 student unauthorized",
    );
  }
}

function itemForAssignment(assignmentId) {
  if (
    assignmentId ===
    TD_PROD_10_FIXTURE.score.assignmentId
  ) {
    return TD_PROD_10_FIXTURE.score.item;
  }
  if (
    assignmentId ===
    TD_PROD_10_FIXTURE.chord.assignmentId
  ) {
    return TD_PROD_10_FIXTURE.chord.item;
  }
  return null;
}

export function tdProd10CredentialsMatch({
  email,
  password,
} = {}) {
  return (
    email ===
      TD_PROD_10_FIXTURE.student.email &&
    password ===
      TD_PROD_10_FIXTURE.student.password
  );
}

export function tdProd10Student() {
  return TD_PROD_10_FIXTURE.student;
}

export function tdProd10PieceTitle() {
  return TD_PROD_10_FIXTURE.piece.title;
}

export function createTdProd10OnlineReadService() {
  return Object.freeze({
    async listPoolItems() {
      requireOnline();
      return Object.freeze([]);
    },

    async getPoolItem() {
      requireOnline();
      throw new Error(
        "TD-PROD-10 pool item unavailable",
      );
    },

    async listAssignments() {
      requireOnline();
      return Object.freeze([]);
    },

    async getAssignment({
      session,
      assignmentId,
    } = {}) {
      requireOnline();
      requireStudent(session);
      const item =
        itemForAssignment(assignmentId);
      if (item === null) {
        throw new Error(
          "TD-PROD-10 assignment unavailable",
        );
      }
      return Object.freeze({
        assignmentId,
        practiceType:
          item.practiceType,
        state: "ACTIVE",
        title: item.package.title,
        teacherNote:
          item.package.practice
            ?.teacherNote ?? "",
        assignedAt:
          TD_PROD_10_FIXTURE.piece
            .assignedAt,
      });
    },

    async getScorePracticeItem({
      session,
      assignmentId,
    } = {}) {
      requireOnline();
      requireStudent(session);
      if (
        assignmentId !==
        TD_PROD_10_FIXTURE.score.assignmentId
      ) {
        throw new Error(
          "TD-PROD-10 SCORE unavailable",
        );
      }
      return TD_PROD_10_FIXTURE.score.item;
    },

    async getChordBoardPracticeItem({
      session,
      assignmentId,
    } = {}) {
      requireOnline();
      requireStudent(session);
      if (
        assignmentId !==
        TD_PROD_10_FIXTURE.chord.assignmentId
      ) {
        throw new Error(
          "TD-PROD-10 CHORD_BOARD unavailable",
        );
      }
      return TD_PROD_10_FIXTURE.chord.item;
    },

    async listPieces({
      session,
      state,
    } = {}) {
      requireOnline();
      requireStudent(session);
      const piece =
        TD_PROD_10_FIXTURE.piece;
      return Object.freeze(
        state === undefined ||
        state === piece.state
          ? [piece]
          : [],
      );
    },

    async getPiece({
      session,
      pieceAssignmentId,
    } = {}) {
      requireOnline();
      requireStudent(session);
      if (
        pieceAssignmentId !==
        TD_PROD_10_FIXTURE.piece
          .pieceAssignmentId
      ) {
        throw new Error(
          "TD-PROD-10 Piece unavailable",
        );
      }
      return TD_PROD_10_FIXTURE.piece;
    },

    async getPieceScoreItem({
      session,
      pieceAssignmentId,
    } = {}) {
      requireOnline();
      requireStudent(session);
      if (
        pieceAssignmentId !==
        TD_PROD_10_FIXTURE.piece
          .pieceAssignmentId
      ) {
        throw new Error(
          "TD-PROD-10 Piece unavailable",
        );
      }
      return TD_PROD_10_FIXTURE.score.item;
    },

    async listPieceChordItems({
      session,
      pieceAssignmentId,
    } = {}) {
      requireOnline();
      requireStudent(session);
      if (
        pieceAssignmentId !==
        TD_PROD_10_FIXTURE.piece
          .pieceAssignmentId
      ) {
        throw new Error(
          "TD-PROD-10 Piece unavailable",
        );
      }
      return Object.freeze([
        TD_PROD_10_FIXTURE.chord.item,
      ]);
    },
  });
}

export function createTdProd10StatusServices() {
  const secureDeliveryStatusService =
    Object.freeze({
      async getAccessStatus({
        session,
        accessRef,
      } = {}) {
        requireOnline();
        requireStudent(session);
        const item = itemForAssignment(
          accessRef?.deliveryId,
        );
        if (item === null) {
          return Object.freeze({
            state: "REVOKED",
          });
        }
        return Object.freeze({
          state: "ACTIVE",
          packageId:
            item.package.packageId,
        });
      },

      async getPieceStatus({
        session,
        pieceAssignmentId,
      } = {}) {
        requireOnline();
        requireStudent(session);
        if (
          pieceAssignmentId !==
          TD_PROD_10_FIXTURE.piece
            .pieceAssignmentId
        ) {
          return Object.freeze({
            state: "REVOKED",
          });
        }
        return Object.freeze({
          state: "ACTIVE",
          piece:
            TD_PROD_10_FIXTURE.piece,
        });
      },
    });

  return Object.freeze({
    publicationStatusService:
      Object.freeze({
        async getPublicationStatus() {
          requireOnline();
          return Object.freeze({
            state: "REVOKED",
          });
        },
      }),
    secureDeliveryStatusService,
  });
}
