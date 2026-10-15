# M1 pilot readiness package

| # | Document | Purpose |
|---|---|---|
| 1 | [Batch size cap plan](01-batch-size-cap-plan.md) | Why and how to cap CSV batches; measurements and the staging protocol that fixes the number |
| 2 | [Staff bootstrap runbook](02-staff-bootstrap-runbook.md) | Create the school id, the first admin and teachers on hosted Supabase; suspend, reset, audit |
| 3 | [Hosted Supabase checklist](03-hosted-supabase-checklist.md) | Every setting that must be on/off/at a value, with what is verified locally vs only on staging |
| 4 | [Pilot deployment checklist](04-pilot-deployment-checklist.md) | Decisions, gates, staging smoke test, go-live, support playbook, monitoring SQL, rollback, sign-off |
| 5 | [Pilot readiness report](05-readiness-report.md) | Verdict (Ready with Conditions), evidence, P0/P1/P2 findings, pilot constraints, readiness criteria |
| 6 | [Hosted pilot configuration and deployment procedure](06-hosted-pilot-configuration.md) | Exact environment variables, Supabase Auth/JWT/refresh/signup/rate-limit settings, and the step-by-step staging→production procedure with verification commands |

## What was verified, and how

Verified on the local stack on the current branch head (not on a hosted project):

- SQL in the runbook and the monitoring queries ran without error; the bootstrap insert, duplicate refusal, suspend and session-revoke behaved as documented.
- Batch timing: sequential 294 ms/row, 4-way concurrency 67 ms/row (provision + enroll).
- RLS covers all 8 public tables; SECURITY DEFINER functions have a pinned `search_path`.
- Session refresh works with token lifetimes above the 90 s client margin and a 10 s refresh-token reuse interval; fails at 0 s reuse interval or lifetimes below the margin.
- Sign-up is refused when disabled; opaque auth emails cannot be derived from usernames.

**Not verifiable without a hosted project** (each is a staging step): `.invalid` email acceptance, the per-IP auth rate limit and its effect on a full class, hosted Security Advisor output, password-policy behaviour, the host's request-time limit, backup/restore timing.

This package contains no application changes.
