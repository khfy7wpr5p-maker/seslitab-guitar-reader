// S07 — safe inline teacher inspector projection.
//
// This module never creates musical truth, mutates notes, or exposes revision,
// source, actor, raw JSON, confidence/verification, MIDI, or frequency internals.
// It projects only the four S07 teacher-editable fields for the exact current
// S06 selection and bounded lifecycle/approval capabilities from existing
// authoritative Package 8 / Stage F contracts.

import { buildStageEVisualEditModel } from './stageEVisualNoteEdit.js'
import {
  getTeacherWorkspaceApplicableApproval,
  getTeacherWorkspaceCurrentRevision,
  isTeacherWorkspace,
} from './teacherWorkspaceModel.js'
import { assessStageFRevisionLifecycle } from './stageFRevisionLifecycle.js'

export const STAGE_S07_VISIBLE_FIELDS = Object.freeze([
  'step',
  'alter',
  'octave',
  'durationValue',
])

const FIELD_LABELS = Object.freeze({
  step: 'Nota harfi',
  alter: 'Arıza',
  octave: 'Oktav',
  durationValue: 'Süre',
})

function safeField(field) {
  return Boolean(field && STAGE_S07_VISIBLE_FIELDS.includes(field.field))
}

export function buildStageS07InlineInspectorModel({ workspace, snapshot } = {}) {
  if (!isTeacherWorkspace(workspace)) return null

  const revision = getTeacherWorkspaceCurrentRevision(workspace)
  const approval = getTeacherWorkspaceApplicableApproval(workspace)
  const lifecycle = assessStageFRevisionLifecycle(workspace)
  const edit = buildStageEVisualEditModel({ workspace, snapshot })

  const fields = edit
    ? edit.fields
        .filter(safeField)
        .map((field) => Object.freeze({
          field: field.field,
          fieldKey: field.fieldKey,
          label: FIELD_LABELS[field.field],
          value: field.value,
        }))
    : []

  return Object.freeze({
    selected: Boolean(edit && fields.length > 0),
    noteIndex: edit?.noteIndex ?? null,
    measureKey: edit?.measureKey ?? null,
    fields: Object.freeze(fields),
    approved: Boolean(approval),
    canUndo: Boolean(lifecycle.undoTarget),
    sourceExact: lifecycle.canRerenderSource === true,
    correctionPending: lifecycle.canRerenderSource !== true && lifecycle.status !== 'no_workspace',
    // No revision/source/actor/fingerprint/internal musical fields are exposed.
    currentNoteIsRest: revision.content?.[edit?.noteIndex]?.isRest === true,
  })
}
