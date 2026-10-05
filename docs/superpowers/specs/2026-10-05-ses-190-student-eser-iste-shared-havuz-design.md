# SES-190 — Student Eser İste + Ortak Havuz Design

Date: 2026-10-05
Status: Design approved in conversation; written spec pending product-owner review
Parent: SES-152
Blocks: SES-158

## Goal

Add the smallest useful Student `Eser İste` flow and a shared, read-only `Havuz` for the same teacher cohort.

A student types only an eser title and submits it. The existing teacher-authority Student Work Request remains the authoritative record. The teacher sees the request in `Ödev Yönetimi → Havuz` with the existing lifecycle actions. Students under the same teacher may also see pending requests in a simple shared Havuz as:

- eser title
- requesting student's display name / nickname

There is no voting, `Ben de istiyorum`, counter, comments, duplicate-request merging, or student lifecycle action.

## Product flow

### Student

`Benim Çalışmalarım`

- `Eser İste`
- `Havuz`
- existing `Aktif Çalışmalar / Bitmiş Çalışmalar / Repertuarım`

`Eser İste` opens a compact form:

- `Eser adı`
- `Gönder`

Success feedback: `İsteğiniz öğretmeninize gönderildi.`

`Havuz` is read-only and shows pending rows only:

- `Carcassi Op. 60 No. 3`
- `Ahmet`

No student-side management button is rendered.

### Teacher

The existing `Ödev Yönetimi → Havuz` remains the management surface. Each request still has teacher-only actions:

- `Aktife Al`
- `Repertuara Al`
- `Kaldır`

The teacher browser continues to receive an internal action key only on its protected management endpoint. Students never receive that key.

## Existing system facts

The backend already supports authenticated request creation at `POST /student/work-requests`. The request title is normalized and limited to 200 characters. A request is bound server-side to exactly one active teacher grant for that student; missing or ambiguous teacher authority fails closed.

The teacher management read model already joins request `studentId` to an active roster entry and exposes `displayNameOrNickname` to the teacher UI.

The existing Student `public_pool` / `/student/pool` is a different publication concept and must remain unchanged.

## Architecture decision

### Chosen approach: derived shared request read model

Keep one authoritative Student Work Request record. Add a new authenticated student read endpoint that derives a safe pending-Havuz projection from existing request + roster data.

A student may read pending requests only for the cohort of the student's exactly-one active teacher grant.

The student projection contains only presentation data:

```text
{
  title,
  displayNameOrNickname
}
```

It must not contain:

- `requestId`
- `studentId`
- `teacherId`
- provider subject / email
- auth token
- Piece / assignment IDs
- lifecycle mutation keys
- diagnostics

Converted or revoked requests disappear naturally because the student shared Havuz lists only `PENDING` requests.

### Alternatives considered

1. **Reuse `public_pool`** — rejected. It would mix publication semantics with request authority and violate the existing SES-170 boundary.
2. **Create a second persisted public-request collection** — rejected. It duplicates source-of-truth state and adds synchronization / orphan risk with no product benefit.
3. **Derived read model from the existing request store** — chosen. One source of truth, no new persistence domain, minimal authority surface.

## Visibility boundary

`Havuz` is shared only among students belonging to the same teacher cohort, not across the whole platform.

Resolution rule:

1. authenticate current user as STUDENT;
2. resolve the current student's exactly-one active teacher grant;
3. list that teacher's work requests;
4. filter to `PENDING`;
5. resolve each request's student through that teacher's active roster;
6. emit only `{ title, displayNameOrNickname }`.

If teacher authority is missing or ambiguous, fail closed. If a pending request cannot be matched to the active roster expected for that teacher, fail closed rather than leak or guess identity.

## API design

Preserve:

- `POST /student/work-requests` — create request, unchanged.
- teacher management request APIs — unchanged in authority.

Add one authenticated read surface, for example:

- `GET /student/work-requests/pending`

Response is a bounded list of presentation-only pending rows. The route name may follow existing router conventions during implementation, but the contract above is binding.

No student endpoint may convert, revoke, place ACTIVE, or place REPERTOIRE.

## Student App integration

Repo: `st-student-app`

The UI remains compact. Do not add a new heavy navigation layer.

Expected touch points:

- existing authenticated API client / repository boundary
- `Benim Çalışmalarım` rendering/navigation
- small request form state
- small shared Havuz list state
- VoiceOver labels/status feedback

`Eser İste` submission requires online API access. Shared Havuz is informational and should not become an offline authorization source. Existing offline Piece access remains unchanged.

## Backend integration

Repo: `seslitab-guitar-reader`

Expected touch points:

- `studentWorkRequestService` — add safe shared pending projection/read operation
- request router — add authenticated GET surface
- store capability reuse — no new persistence domain if existing teacher-scoped request listing and roster reads can satisfy the projection
- API client contract tests

Prefer reusing the existing roster display-name source (`displayNameOrNickname`) rather than storing a copied student name on the request record.

## Security and authority invariants

1. Student request creation never creates an ACTIVE or REPERTOIRE Piece by itself.
2. Teacher remains the only actor allowed to convert or revoke a pending request.
3. Shared Havuz is read-only.
4. Student shared DTO has no stable internal IDs or management action key.
5. A student sees only the pending request cohort belonging to the same authoritative teacher relationship.
6. `public_pool` behavior and storage stay unchanged.
7. ACTIVE / REPERTOIRE Piece lifecycle and SES-157 child-isolation behavior stay unchanged.
8. Request conversion/revoke is reflected by disappearance from shared Havuz; no duplicate public record is maintained.
9. No name is inferred from provider email or provider subject; use the roster presentation field only.
10. Any authority ambiguity fails closed.

## Accessibility and UI constraints

- iPhone Safari remains usable without horizontal overflow.
- `Eser İste`, `Eser adı`, `Gönder`, and `Havuz` have understandable accessible names.
- Success/error feedback is available to VoiceOver, not visual-only.
- Havuz rows announce title and student display name understandably.
- No internal IDs, debug strings, token values, raw error objects, or provider identity details are rendered.

## Acceptance matrix

### Request creation

- Student A submits `Carcassi Op. 60 No. 3`.
- Exactly one authoritative PENDING request is stored.
- No Piece is created.
- Student receives success feedback.

### Shared Havuz

- Student A sees `Carcassi Op. 60 No. 3 — Ahmet`.
- Student B under the same teacher sees the same pending row.
- A student under another teacher does not see the row.
- No student response contains request/student/teacher/provider/assignment IDs.

### Teacher management

- Teacher sees the same request exactly once in private `Ödev Yönetimi → Havuz`.
- Existing `Aktife Al`, `Repertuara Al`, and `Kaldır` actions continue to use the protected exact request identity.

### Lifecycle reflection

- After `Aktife Al`, the request disappears from shared pending Havuz and the resulting Piece follows existing ACTIVE rules.
- After `Repertuara Al`, the request disappears from shared pending Havuz and the resulting Piece follows existing REPERTOIRE rules.
- After `Kaldır`, the request disappears from shared pending Havuz and cannot be restored through a student action.

### Regression

- Existing `/student/pool` tests remain unchanged and green.
- SES-156 teacher management remains green.
- SES-157 lifecycle isolation remains green.
- Student offline Piece behavior remains green.
- VoiceOver/browser tests cover the new controls.

## E2E completion relation

SES-190 is a prerequisite for the full SES-158 user flow:

`Student Eser İste → shared Havuz + teacher private Havuz → teacher Aktife Al → Student Aktif Çalışmalar → teacher Repertuara Al → Student Repertuarım`.

SES-158 should resume only after SES-190 implementation is merged and deployed to the applicable frontend/backend services.