# KU DB Phase 1

Branch: `codex/supabase-phase1`. No automatic main merge.

## Usage

Sign in with the existing Google button. Open 저장기록 and click 현재 독서 DB 저장
to explicitly upload the current reading snapshot, including book photos and
heatmaps if present. 내 DB 기록 queries the authenticated account's records on
any device. 선택한 DB 기록 삭제 deletes only the selected database snapshot and
its note. Browser records remain separate and are never migrated or deleted.
Current reading state is not overwritten when browsing a database snapshot.

Express needs server-only `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. No new package
or frontend key is needed. Restart the Express process after code changes.

## Authentication and access

`/api/db/sessions` (GET) and `/api/db/sessions/:id` (PUT/DELETE) resolve the same
HttpOnly `ku_session` used by Google login. A missing, expired or logged-out
session gets 401 before any DB access. Client-provided ownership is ignored.
Every query/delete uses the authenticated Google sub; composite primary/foreign
keys prevent duplicate saves and cross-account note references.

The SQL migration grants CRUD only to `service_role`, enables/forces RLS and
adds no browser access policies. Secret keys bypass RLS, so Express ownership
checks remain mandatory. Migration SQL was run by the user; this implementation
does not run DDL or change existing records automatically.

## Failure behavior

DB operations have a 5-second request timeout and return sanitized 503 responses.
They are independent of Gemini, recommendations, login and localStorage writes.
Session JSON is the canonical restore source. The separate note row is a derived
projection. REST saves of a session and note are not a single transaction:
partial failure reports 503, and retrying the same ID repairs the projection.
The dialog retains that ID/snapshot for retries. Session deletion cascades notes.

## Verification

`npm test` (70 tests), `npm run typecheck`, `npm run build` passed.

`node --import tsx tests/database.live.ts` uses real Supabase REST storage and an
isolated Express test app with the production auth/session implementation.
Google verification is substituted with A/B fixtures only in that test app;
production Google verification is unchanged and covered by signature/claim tests.

The live probe verified access to all three tables, profile/session/note CRUD,
idempotent retries, A/B isolation (including equal session IDs), forbidden origin,
logout session invalidation, restoration with a fresh login cookie, delete
cascade and cross-account FK rejection. No-key REST requests were denied.
Only uniquely named probe users/records were created, then deleted. Existing
user data, localStorage and production login sessions were not used or changed.

AI request compaction, model calls/timeouts, recommendation algorithm and gaze
implementation were not modified by the DB change. Their regression tests pass.
