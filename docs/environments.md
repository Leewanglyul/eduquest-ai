# Environments: local and hosted Supabase

The app reads exactly three variables (`src/lib/env.ts`). Which Supabase project they point at is decided by the active `.env.local`. This page explains how to keep a **local** and a **hosted** profile side by side and switch between them safely.

| Variable | Local value | Hosted value | Secret |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` | `https://<project-ref>.supabase.co` | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from `supabase status` | Dashboard → Project Settings → API | no (public by design) |
| `SUPABASE_SERVICE_ROLE_KEY` | from `supabase status` | Dashboard → Project Settings → API | **yes** |

## Files

| File | Committed | Purpose |
|---|---|---|
| `.env.local.example` | yes | Template for the local profile (placeholders only) |
| `.env.hosted.example` | yes | Template for a hosted profile (placeholders only) |
| `.env.example` | yes | The original names-only reference; unchanged |
| `.env.profiles/local.env` | **no** (ignored) | Your real local profile |
| `.env.profiles/hosted.env` | **no** (ignored) | Your real hosted profile (staging) |
| `.env.local` | **no** (ignored) | The **active** profile. This is the file Next.js reads. Written by the switch script, do not edit it by hand |
| `.env.local.bak` | **no** (ignored) | Previous `.env.local`, kept when a switch changes it |
| `scripts/env-profile.mjs` | yes | The switch script behind `pnpm env:*` |

Nothing with a real value is ever committed. `.gitignore` covers `.env.local`, `.env.local.bak` and `.env.profiles/`.

## Commands

```bash
pnpm env:status     # which profile is active, which host it points at, whether the 3 keys are set
pnpm env:local      # activate the local Supabase profile
pnpm env:hosted     # activate the hosted profile (validated first)
pnpm env:hosted -- --allow-production   # only for a profile labelled "production"
```

The script never prints key values (only the host name and the length of each value). After switching:

- restart `pnpm dev`;
- rebuild before `pnpm start`: the two `NEXT_PUBLIC_*` values are inlined into the build and the middleware.

## Local profile (default)

1. `supabase start`
2. `pnpm env:local`: on first use it creates `.env.profiles/local.env` from `supabase status -o env` and activates it. The result is identical to a hand-written local `.env.local`.
3. `supabase db reset` (applies the 16 migrations and `supabase/seed.sql`, which creates `teacher@example.com`), then `pnpm dev`.

Manual alternative: copy `.env.local.example` to `.env.profiles/local.env`, paste the values printed by `supabase status -o env`, then `pnpm env:local`.

Local-only actions: `supabase db reset`, `seed.sql`, `pnpm test:access`, `supabase test db`, `pnpm db:types`.

## Hosted profile (a Supabase cloud project)

Use a **staging** project for development. Do not use production for day-to-day work.

1. Create the project and apply the settings of `docs/pilot/06-hosted-pilot-configuration.md` (signup off, email provider only, JWT 3600 s, refresh-token reuse interval 10 s, minimum password length 8).
2. Link the CLI and deploy the schema: `supabase link --project-ref <ref>` then `supabase db push --dry-run`, then `supabase db push`. **Never** `supabase db reset`, **never** load `seed.sql`, **never** `--include-seed`.
3. Create the profile: run `pnpm env:hosted` once. It copies `.env.hosted.example` to `.env.profiles/hosted.env` and stops. Fill in the three values from Dashboard → Project Settings → API and set `EDUQUEST_PROFILE_LABEL=staging`.
4. `pnpm env:hosted` again. It validates the profile and activates it.
5. Create a first admin and teacher in that project with `docs/pilot/02-staff-bootstrap-runbook.md` (the seed teacher does not exist there).
6. `pnpm dev`.

What the script checks before it writes `.env.local`:

| Check | Why |
|---|---|
| All three variables present, none still a `<placeholder>` | A half-filled template must not become active |
| The hosted URL is `https` and not a local address | Prevents pointing the "hosted" profile at localhost by mistake |
| The local profile points at `127.0.0.1` / `localhost` | Prevents the reverse mix-up |
| `EDUQUEST_PROFILE_LABEL` is `staging` or `production` | Every hosted profile says what it is |
| A `production` label needs `--allow-production` | Development against production is a deliberate act |
| Anon key is different from the service-role key | Catches a copy/paste mistake |

While a hosted profile is active:

- `pnpm test:access` refuses to run (its setup file only accepts a local URL). Switch back with `pnpm env:local` to run the tests.
- Do not run `supabase db reset`, `pnpm db:reset` or anything that loads `seed.sql`.
- Real student data may be present. Do not paste the service-role key anywhere.
- Schema changes still go through migration files and `supabase db push`.

## Switching back and forth

```bash
pnpm env:local      # local Supabase
pnpm env:hosted     # staging
pnpm env:status     # confirm before running anything destructive
```

Run `pnpm env:status` before any command that changes data. Typical mix-ups and what catches them:

| Mix-up | Protection |
|---|---|
| Running the access tests against a hosted project | Test setup refuses a non-local URL |
| Activating a production profile for development | `--allow-production` required |
| Committing real keys | Templates hold placeholders; profile files and `.env.local` are ignored |
| Using local keys against a hosted URL (or the reverse) | Each project has its own keys; the local profile must point at localhost, the hosted one must not |

## Hosting platform (staging / production deployments)

Deployed builds do **not** use these files. Set the three variables in the host's environment settings instead (`NEXT_PUBLIC_*` in the **build** environment as well; the service-role key at runtime only). The full procedure is in `docs/pilot/06-hosted-pilot-configuration.md` §3.2 and `docs/pilot/08-hosted-pilot-execution-guide.md` §2 A.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `pnpm env:local` says it cannot read the local stack | `supabase start` was not run, or the CLI is not on `PATH` | Start the stack, or copy the local template and fill it in manually |
| `pnpm env:hosted` says the profile is not usable | Placeholders left in `.env.profiles/hosted.env`, missing label, or a local URL | Edit the profile as the message says |
| App still talks to the old project after switching | `pnpm dev` or a built app is still running with the old values | Restart `pnpm dev`; for `pnpm start` run `pnpm build` again |
| Everyone is bounced to sign-in after switching | The browser still holds the other project's session cookie | Sign in again (or clear the site's cookies) |
| `pnpm test:access` refuses to run | A hosted profile is active | `pnpm env:local` |
