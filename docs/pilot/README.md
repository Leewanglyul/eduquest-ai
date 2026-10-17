# M1 pilot readiness package

| # | Document | Purpose |
|---|---|---|
| 1 | [Batch size cap plan](01-batch-size-cap-plan.md) | Why and how to cap CSV batches; measurements and the staging protocol that fixes the number |
| 2 | [Staff bootstrap runbook](02-staff-bootstrap-runbook.md) | Create the school id, the first admin and teachers on hosted Supabase; suspend, reset, audit |
| 3 | [Hosted Supabase checklist](03-hosted-supabase-checklist.md) | Every setting that must be on/off/at a value, with what is verified locally vs only on staging |
| 4 | [Pilot deployment checklist](04-pilot-deployment-checklist.md) | Decisions, gates, staging smoke test, go-live, support playbook, monitoring SQL, rollback, sign-off |
| 5 | [Pilot readiness report](05-readiness-report.md) | Verdict (Ready with Conditions), evidence, P0/P1/P2 findings, pilot constraints, readiness criteria |
| 6 | [Hosted pilot configuration and deployment procedure](06-hosted-pilot-configuration.md) | Exact environment variables, Supabase Auth/JWT/refresh/signup/rate-limit settings, and the step-by-step staging→production procedure with verification commands |
| 7 | [Final pilot package](07-final-pilot-package.md) | Review of `docs/pilot/*`, final pilot constraints, the single ordered staging checklist, and the final production blockers |
| 8 | [Hosted pilot execution guide](08-hosted-pilot-execution-guide.md) | The operator run sheet (env vars, project configuration, migration order, teacher bootstrap, smoke test, rollback), scale validation of the pilot assumptions, and the final Required / Recommended / Defer readiness checklist and status |
| 9 | [M1 release closure checklist](09-m1-release-closure-checklist.md) | The single actionable list that closes M1: R1-R12 (and decisions D1-D6) with owner, effort, dependencies, completion evidence, sequence and schedule risks |
| 10 | [Pilot execution preparation](10-pilot-execution-preparation.md) | Staging preparation checklist (Supabase settings, environment variables, Security Advisor expectations), the operator runbook (bootstrap, classroom, student import, reissue, emergency lockout recovery), the risk register and the final readiness summary |
| 11 | [Hosted verification package](11-hosted-verification-package.md) | What to verify on the hosted project (VER-01..44), the exact staging test sequence (ST-01..63, incl. a validated rate-limit/A1 load generator), the final Supabase settings sheet, batch cap options, and the go-live decision workflow |
| 12 | [D6 data governance policy](12-d6-data-governance-policy.md) | Consent, retention, erasure and teacher suspension policies and procedures (final text, awaiting signature in 13) |
| 13 | [D6 sign-off](13-d6-signoff.md) | Decisions, school-supplied facts, accepted limits, conditions and signatures that close D6 / R10 |

## What was verified, and how

Verified on the local stack on the current branch head (not on a hosted project):

- SQL in the runbook and the monitoring queries ran without error; the bootstrap insert, duplicate refusal, suspend and session-revoke behaved as documented.
- Batch timing: sequential 294 ms/row, 4-way concurrency 67 ms/row (provision + enroll).
- RLS covers all 8 public tables; SECURITY DEFINER functions have a pinned `search_path`.
- Session refresh works with token lifetimes above the 90 s client margin and a 10 s refresh-token reuse interval; fails at 0 s reuse interval or lifetimes below the margin.
- Sign-up is refused when disabled; opaque auth emails cannot be derived from usernames.

**Not verifiable without a hosted project** (each is a staging step): `.invalid` email acceptance, the per-IP auth rate limit and its effect on a full class, hosted Security Advisor output, password-policy behaviour, the host's request-time limit, backup/restore timing.

This package contains no application changes.
