# 17. TV-1: hosting impact report

Status: **REPORT, accepted by the PM as the official impact review on 2026-10-21. PM verdict: READY WITH CONDITIONS. Hosting stays NO-GO. Nothing is applied.** No `db push`, no deployment, no Production change, no flag change. Facts below were read from the repository and read-only from the hosted project (`eduquest-ai-pilot`, `anlxidvwtogguyzrrvbs`). Related: [m2/14](14-tv1-teacher-visibility-design.md) (design), [m2/16](16-tv1-implementation-review.md) (review), commit `006223a` (local implementation), [m2/15](15-f1-hosted-verification-plan.md) (hosted state).

Earlier documents: m2/15 and m2/16 were committed and pushed in `5437d4a`. The verification plan that follows from this report is [m2/18](18-tv1-hosted-verification-plan.md) (plan A, database only); the governance side is in the pilot/12 revision draft and the pilot/13 alignment review.

## 1. Recommendation

**Hosting: NO-GO until the preconditions of §7 are met. Technically ready: yes.** The change is small and reversible. The blockers are governance and the lack of a database-connected deployment to verify on, not the code.

## 2. What would be applied

| Item | Detail |
|---|---|
| Migration | exactly one pending: `20261021000001_crossword_assignment_progress.sql` (confirmed by `supabase migration list` and `supabase db push --dry-run`: "Would push these migrations: 20261021000001 only") |
| Objects | one function `public.fn_crossword_assignment_progress(uuid, uuid, uuid)`, `SECURITY INVOKER`, `search_path` pinned, `EXECUTE` revoked from `PUBLIC`, `anon`, `authenticated`, granted to `service_role` |
| Not created or changed | no table, column, enum, trigger, policy, index; no existing function or table is altered; no data is written or backfilled |
| Existing data | untouched: the function is read-only (`STABLE`) and nothing calls it until the page is shown |
| Preconditions on hosted (checked) | the function does not exist yet; its two dependencies exist (`fn_crossword_actor_role`, `fn_crossword_play_wordcells`); the five tables it reads exist (`classroom_teachers`, `classroom_enrollments`, `crossword_assignments`, `crossword_attempts`, `crossword_attempt_members`) |

## 3. Current hosted state (read-only, 2026-10-21)

| | Value |
|---|---|
| `crossword_attempts` / `assignments` | 0 / 0 (no puzzle published, rule in force) |
| Students | 64 (was 62 on 2026-10-20; cause not established, open observation OP-2). **PM decision 2026-10-21: assumed to possibly include real students; documents and plans treat the project at the level of real student data** |
| Teachers / admins | 1 / **0** |
| `CROSSWORD_PLAY_ENABLED` | not defined in any Vercel scope |
| Deployments | all Preview; no Production deployment; Preview has **no Supabase variables** |

## 4. Impact by area

| Area | Impact | Risk |
|---|---|---|
| Database schema | one new function; no change to tables | **Low** |
| RLS / privileges | none. Attempt tables stay RLS-on, no policy, no client privilege. The function is callable only with the service role | **Low** |
| Student data exposure | the function returns names, student numbers, states, counts and times to classroom owners, co-teachers and school admin (PM decision). It never returns letters, answers, cell keys or event details (result type is an allow-list, tested) | **Medium, by decision:** it is a new access to student-linked data, covered only once `pilot/12` is revised and `pilot/13` is resolved |
| Authorization | classroom-level: owner, co-teacher of that classroom, school admin; unknown and not-allowed ids give the same error. Tested by pgTAP 00015 including the two-classroom case and a negative control | **Low** after tests; the one place a mistake would matter |
| Existing features | none changed: no student screen, no API route, no existing function. The M1 and M2-1 and M2-2 teacher screens are unchanged except one link on the assignment list that appears only when Student Play is on | **Low** |
| Application code | the page and link exist in the branch and are hidden while `CROSSWORD_PLAY_ENABLED` is off | **Low** |
| Generated types | `src/types/database.ts` gains one `Functions` block (already committed) | **Low** |
| Performance | one call per page view, tens of rows, existing indexes | **Low** |
| Privacy of real students on hosted | no effect while the flag is off and no puzzle is published: the function has no rows to return and no page is reachable | **Low** |

## 5. Verification on hosted: what can and cannot be done

The hosted project has **1 teacher and no admin**, and no classroom with a published puzzle. To verify the authorization the way pgTAP does, hosted would need test accounts and data: a test classroom, test students, a published `SMOKE` puzzle, an attempt, and at least a test co-teacher, a test non-staff teacher and a test admin. That means:

- creating `SMOKE`-prefixed **teacher and admin accounts** on the pilot project (more than the single student of the earlier smoke tests), then deleting them;
- **publishing a puzzle on hosted**, which the operating rule forbids until the PM lifts it;
- a **database-connected deployment**: the current Preview has no Supabase variables, so it cannot call the function at all.

Smaller alternative, **plan A, prepared in [m2/18](18-tv1-hosted-verification-plan.md)** (database only, no deployment): after the push, create `SMOKE` fixtures with SQL (the puzzle is created through the database functions, not through the application), run the 18 read-only checks, then clean up. The `SMOKE` classrooms are owned by `SMOKE` teachers, so nothing appears in the real teacher's screens. The scripts were dry-run on the local database (18 of 18 passed, counts back to the baseline). This verifies the function on hosted but not the page; the page needs a database-connected deployment. Both need explicit PM approval because they create test data on the pilot project (the puzzle is created in the database while the rule "no puzzle published on hosted" is in force, so the rule must be lifted for the window).

## 6. Rollout and rollback

Rollout (unchanged from m2/16 §6): preconditions → impact report (this) → explicit PM go → `supabase db push` of the one migration (re-run `--dry-run` first and check it lists only that file) → deploy app code only to a deployment the PM names → verify on `SMOKE` data → remove test data → TV-1 closed. Flag stays off throughout; the page stays hidden until the release decision.

Rollback:

| Layer | Action | Effect |
|---|---|---|
| Visibility | flag off (it is off) | link and page hidden |
| App | redeploy the previous commit | page gone |
| Database | forward migration `DROP FUNCTION public.fn_crossword_assignment_progress(uuid, uuid, uuid);` | no data involved; nothing else depends on the function; student erasure and attempt cleanup unaffected |

Order for an emergency: flag off first, then app, then (only if needed) drop the function. Dropping the function while the page is deployed and visible would show an error page; with the flag off nobody sees it.

## 7. Preconditions before a hosted push (all unmet today)

| # | Condition | Owner | State |
|---|---|---|---|
| 1 | `pilot/12` third revision approved (final), including teacher access to progress and the progress purpose | PM, school data-protection contact | draft only |
| 2 | `pilot/13` status resolved and signed for the revised text. Whether a signed copy exists is a **school operations record** question, not managed in this repository | PM, school | unresolved |
| 3 | Explicit PM approval of this report (after the impact review) | PM | pending |
| 4 | Decision on how to verify: plan A (database only, m2/18) first, and later a database-connected deployment for the page (Preview variables or another target); approval to create the `SMOKE` data and the test puzzle on hosted | PM, Vercel owner | plan A prepared, approval open |
| 5 | The operating rule "no puzzle published on hosted" lifted for the verification window only | PM | in force |

## 8. Other risks and open observations

- **No admin account on hosted.** The admin read-only path is untested on hosted until a test admin exists; locally it is covered (pgTAP and flow test).
- **Production setup:** Production tracks `main` and has no deployment; no merge to `main` without PM approval. TV-1 code reaches only Preview deployments of the M2 branch until then.
- **OP-2** (students 62 to 64; treated as possibly real students by PM decision 2026-10-21) and **OP-1** (untracked files in the repository root, possible personal data) are unchanged and unrelated to this change.
- **Local-only evidence:** all tests ran on the local stack (pgTAP 592, vitest 773, build, typecheck); nothing about TV-1 has been run against the hosted database.

## 9. Decision requested

1. Accept this report as the impact review for the one migration (or ask for changes).
2. Keep **hosting NO-GO** until preconditions 1 and 2 are resolved.
3. When the time comes, approve plan A of [m2/18](18-tv1-hosted-verification-plan.md) (and the test data it needs), then decide how the page is verified.
