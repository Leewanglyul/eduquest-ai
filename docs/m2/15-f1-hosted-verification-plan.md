# 15. F-1 hosted verification: plan and execution record

Status: **EXECUTED 2026-10-21. PM status: CONDITIONAL GO.** PM decision: Option A, verify F-1 on a **Vercel Preview** deployment of the M2 branch, not on Production. Related: [m2/12](12-f1-feature-flag-api-gating-design.md) (design), [m2/11](11-student-play-release-readiness-audit.md) §12 (F-1 blocker), commit `c6f1f67` (F-1 implementation). Nothing on Production, in the database or in a feature flag was changed by this verification.

Parts: §1 plan (corrected where the execution showed it was wrong) · §2 execution record: V1 to V8 · §3 probe results · §4 known deviations · §5 verdict and conditions · §6 open points.

## 1. Plan

### 1.1 What a Preview deployment is here

- With the Vercel GitHub integration, every push of a non-production branch builds a Preview deployment with its own URL. Previews of the M2 branch already existed.
- Environment variables are scoped (Production / Preview / Development). A Preview uses the Preview scope only.
- Never promote a Preview, and do not merge M2 into the Production branch for this verification.

### 1.2 Settings checked (project owner's dashboard)

V1 Production Branch · V2 a Preview of the M2 branch exists · V3 its commit SHA includes F-1 · V4 Preview environment variables · V5 which Supabase project they point to · V6 `CROSSWORD_PLAY_ENABLED` not defined · V7 Deployment Protection on · V8 Production settings untouched. Results: §2.

### 1.3 Procedure

| Step | What | Done |
|---|---|---|
| 1 | Baseline row counts of the hosted database (read-only) | yes |
| 2 | Request `GET .../api/state` without a student session: a JSON `404 {"error":"NOT_FOUND"}` with `no-store` identifies the build with F-1 (an HTML 404 would be the m1 build, a 401 an M2 build before F-1, a 200 a stop) | yes |
| 3 | Probe every handler (`save`, `check`, `reveal`, `chosung`, `submit`) with requests that would normally give a different status (bad JSON, valid shape, no session) | yes, with the deviations of §4 |
| 4 | Sign in as a `SMOKE` student on the Preview and call the API with a real session | **not done** (§4: the Preview has no Supabase variables) |
| 5 | Row counts after | yes, hosted database only |
| 6 | Cleanup of test data | nothing was created, so nothing to clean |

Limit stated in the plan and still true: without a published assignment an authenticated student gets 404 even without F-1, so a signed-in test would not prove F-1 on its own. The proof is steps 2 and 3. The case with a real assignment is covered by the local flow test ("the feature flag turns the API off"). No puzzle is published on hosted (operating rule in force).

### 1.4 Decision rule

F-1 GO when the deployment includes `c6f1f67`, step 2 returns the JSON 404, all six handlers return 404 in step 3, attempt rows stay at 0, and `CROSSWORD_PLAY_ENABLED` was never defined. Stop and report on any 200, 401, 403, HTML 404 on a play route, any attempt row, or if the flag is defined.

## 2. Execution record: V1 to V8

Executed 2026-10-21 by reading the Vercel dashboard (read-only, through the PM's signed-in Chrome, Claude in Chrome) and calling the Preview. Environment variables were read by **name only**; no value was opened.

| # | Check | Result |
|---|---|---|
| V1 | Production Branch | **Differs from the assumption.** The project `eduquest-ai-pilot` (team `sonline-2`, Hobby) tracks **`main`** for Production, not `m1/issue-005-student-provisioning`. The domain `eduquest-ai-pilot.vercel.app` is attached to the Production environment. The dashboard shows **"No Production Deployment"**. The m1 and m2 branch deployments are all **Preview**. `main` exists on origin (`2eb9d25`); the m1 branch head on origin is `8fec092` |
| V2 | Preview of the M2 branch | **Exists**, several, all Ready. Stable alias `eduquest-ai-pilot-git-m2-m2-1-content-pipeline-sonline-2.vercel.app` |
| V3 | Commit of the Preview | Newest: **`49cd20d`** (Ready, created from the M1-BUG-01 fix commit), which contains **`c6f1f67`**. A separate Preview built from `c6f1f67` is also Ready |
| V4 | Preview environment variables | **None.** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` exist in the **Production scope only** (added Oct 16) |
| V5 | Connection to the hosted pilot Supabase | **Not connected**: without Preview variables the Preview has no Supabase. The Production-scope value was not opened |
| V6 | `CROSSWORD_PLAY_ENABLED` | **Not defined** in any scope: the project has exactly the three variables above |
| V7 | Deployment Protection | **On**: Vercel Authentication, "Standard Protection"; password protection off (Pro feature) |
| V8 | Production untouched | Nothing was changed. Production variables are dated Oct 16; there is no Production deployment |

Hosted database counts (read-only, 2026-10-21): `crossword_attempts` 0, `crossword_attempt_members` 0, `crossword_attempt_events` 0, `crossword_assignments` 0, `students` 64. The students count was 62 on 2026-10-20; the two extra students were not created by this verification (cause not established; it may be pilot or M1 real-device activity). It does not affect the attempt tables.

## 3. Probe results

Probes were sent from the Preview's own origin by a signed-in Vercel team member (no student session), against the assignment id `5a000000-0000-4000-8000-0000000000d1` (a well-formed id that does not exist).

| Request | Status | content-type | cache-control | Body |
|---|---|---|---|---|
| `GET .../api/state` | **404** | application/json | no-store, max-age=0 | `{"error":"NOT_FOUND"}` |
| `POST .../api/save`, body `not json` | **404** | application/json | no-store | `{"error":"NOT_FOUND"}` |
| `POST .../api/save`, valid shape | **404** | application/json | no-store | same |
| `POST .../api/check` | **404** | application/json | no-store | same |
| `POST .../api/reveal` | **404** | application/json | no-store | same |
| `POST .../api/chosung` | **404** | application/json | no-store | same |
| `POST .../api/submit` | **404** | application/json | no-store | same |
| `GET /student/crosswords` (page) | 404 | HTML | no-store | Next "not found" page |
| `GET .../api/save` (wrong method) | **405** | none | public, max-age=0, must-revalidate | empty (see §4) |

Reading: the JSON 404 body with `no-store` is produced by the F-1 gate in `playRoute`; the m1 build would answer with an HTML 404 and an M2 build without F-1 would answer 401 or 400 for these requests. All six handlers (`state`, `save`, `check`, `reveal`, `chosung`, `submit`) answered 404 with the flag off.

## 4. Known deviations (PM-recorded)

1. **`GET .../api/save` answered 405, not 404.** `save/route.ts` exports only `POST`, so Next.js answers 405 itself and never calls the handler or `playRoute`. The plan's expectation "wrong method gives 404" was wrong for routes that lack that method; it is not an F-1 failure. For `state` (GET only) the same applies to a POST. No code is involved and no student data is reachable by it. The 405 carries no information about the feature beyond what any route gives.
2. **No cross-site header test.** A browser cannot set `Sec-Fetch-Site`, so the probe "cross-site POST gives 404 instead of 403" was not run. The ordering "flag before origin check" is covered by the unit tests (`crossword-play-flag-routes.test.ts`: a foreign-origin request gets 404 with the flag off) and the static source-order guard.
3. **The Preview has no Supabase variables** (V4). Consequences: (a) step 4 (a signed-in `SMOKE` student on the Preview) could not be done because sign-in needs Supabase; (b) the Preview cannot reach the hosted database, so "attempts stay at 0" is true by construction for this Preview and is weaker evidence than a Preview that holds the database variables; (c) the Preview is not an acceptance environment for Student Play. The 404 results do not depend on Supabase: the flag check runs before anything else.

## 5. Verdict

**F-1: CONDITIONAL GO (PM, 2026-10-21).** Established: the deployed Preview contains F-1 (`49cd20d` ⊇ `c6f1f67`), the flag is not defined in any scope, Deployment Protection is on, and every play API handler answers 404 with the flag off. Not established (conditions): a signed-in student on a deployment connected to the hosted database (step 4); the cross-site header probe.

F-1 stays recorded as implemented and verified at the gate level; it stops being a release blocker for the gate behaviour, with the two conditions above carried to the hosted acceptance run of [m2/09](09-g5-device-validation.md) §9 (which needs an environment connected to the database). The operating rule "no puzzle published on hosted" is not lifted by this record; lifting it is a PM decision.

## 6. Open points

1. **Production setup does not match the working assumption.** Production tracks `main` and has no deployment, so `eduquest-ai-pilot.vercel.app` currently has nothing in Production. Pushing or merging to `main` would create the first Production deployment, using the Production-scope Supabase variables. No merge to `main` without PM approval. What the PM described as Production (m1 branch, commit `a4d95b8`) corresponds to Previews, not to a Production deployment.
2. **Preview variables.** For hosted acceptance (device runs, student sign-in) a deployment with Supabase variables is needed. Adding Preview-scope variables makes Previews share the pilot database; that is a Vercel configuration change for the owner, with secrets never passed through chat, and is not done here.
3. **Students count 62 to 64** on the hosted database since 2026-10-20: cause not established.
4. **Unchanged:** `CROSSWORD_PLAY_ENABLED` is off everywhere; no Production, database or flag change; Galaxy Tab testing has not started.
