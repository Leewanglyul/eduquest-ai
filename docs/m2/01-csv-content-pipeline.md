# M2-1. CSV content pipeline (design)

Status: **design only. No code, migration or test exists yet.** D12, D13 and D14 are **decided** (§10); the build plan is [02-implementation-plan.md](02-implementation-plan.md). Written against branch `m1/issue-005-student-provisioning` (head `8fec092`), M1 pilot candidate. Owner: engineering. Needs: PM answers to the still-open decisions in §10 (D1–D11) before the phases that depend on them (see the plan).

Scope: a teacher uploads a CSV with the columns `term,definition`; the system stores it as a **word set** and keeps the data a later crossword generator will read. Out of scope: the crossword generator, XLSX / Google Sheets / PDF input, student-facing screens, AI-generated content, sharing sets between teachers or schools.

Parts: §1 Content schema · §2 Database design · §3 Upload workflow · §4 Validation rules · §5 Storage model · §6 Teacher management workflow · §7 Future consumers · §8 Test plan · §9 Assumptions · §10 Open decisions for the PM.

Revision note: §5–§7 were added after the PM's M2-1 brief (content schema, database, upload workflow, validation, storage model, teacher management workflow; preparing question generation, crossword generation and learning games). The brief's example rows have no header line; the PM decided the header is required (D12).

Conventions this design keeps from M1 (checked against the code and migrations): one cap constant file passed to the UI as props · server actions in a `"use server"` file · preview/commit split with a hashed single-use token · RLS enabled on every public table, service-role-only tables for batches and audit · `audit_logs.metadata jsonb` · `owner_id` on the parent row · soft archive by `archived_at` · UI text in Korean · pnpm.

---

## 1. Schema: the CSV file and the parsed row

### 1.1 File format

| Property | Rule |
|---|---|
| Extension / type | `.csv` (`text/csv`); the server does not trust the extension, only the bytes |
| Encoding | **UTF-8**. A leading BOM (`EF BB BF`) is accepted and removed. Decoding is strict (`TextDecoder("utf-8", { fatal: true })`). UTF-16 BOMs (`FF FE`, `FE FF`) get their own error. No automatic EUC-KR/CP949 conversion (§4.6) |
| Delimiter | comma `,` only |
| Quoting | RFC 4180: a field may be wrapped in `"`; `""` inside means one `"`; commas and line breaks are allowed inside quotes |
| Line endings | CRLF, LF or CR |
| Header | **required**, first non-blank record, matched case-insensitively after trim. Columns are found **by name, in any order** |
| Columns | `term` and `definition`. Aliases: term = `term`, `용어`, `단어`, `정답`; definition = `definition`, `뜻`, `설명`, `정의`, `힌트`. Extra columns are ignored with a file-level notice. A repeated column name is an error |
| Blank records | skipped, but **counted when numbering rows** (§1.3) |
| Limits | one source file, §4.7: `MAX_CONTENT_ROWS` rows, `MAX_CONTENT_CSV_BYTES` bytes |

Minimal valid file:

```csv
term,definition
사과,빨간색이나 초록색의 둥근 과일
도서관,책을 빌리거나 읽을 수 있는 공공 시설
ice cream,"우유와 설탕으로 만든 차가운 간식, 여름에 인기"
```

A teacher-friendly Korean header is equally valid:

```csv
용어,뜻
광합성,식물이 빛에너지로 양분을 만드는 과정
```

### 1.2 Parsed row model

Raw row (what the CSV parser returns; the analogue of M1's `RawStudentRow`):

```ts
type RawContentRow = {
  line: number;        // spreadsheet row number: header = 1, first data row = 2, blank rows counted
  term: string;        // cell exactly as parsed
  definition: string;  // cell exactly as parsed
};
```

Prepared row (after normalisation, §4.2; this is what is hashed, previewed and stored):

```ts
type PreparedContentRow = {
  line: number;
  term: string;          // display form: NFC, controls removed, whitespace collapsed, trimmed
  definition: string;    // same cleaning as term
  answer: string;        // grid form: spaces/punctuation removed, Latin upper-cased, only 가-힣 A-Z 0-9
  answerLength: number;  // code points of `answer` = number of grid cells
  script: "hangul" | "latin" | "digit" | "mixed";
  warnings: ContentRowWarningCode[];   // never blocks
};

type ContentPreviewIssue = {           // a rejected row
  line: number;
  term: string;                        // trimmed raw term, for display only
  errors: ContentRowErrorCode[];       // codes; the UI maps them to the §4.8 messages
  messages: string[];
};
```

Preview result: `{ valid: PreparedContentRow[]; invalid: ContentPreviewIssue[]; fileNotices: string[]; counts }`. The `valid` / `invalid` split is the same shape as M1's `BatchPreview`.

### 1.3 Examples

| File row | `term` | `answer` | `answerLength` | `script` | Result |
|---|---|---|---|---|---|
| 2 | 사과 | 사과 | 2 | hangul | ok |
| 3 | 도서관 | 도서관 | 3 | hangul | ok |
| 4 | ice cream | ICECREAM | 8 | latin | ok (space removed in the answer only) |
| 5 | e-mail | EMAIL | 5 | latin | ok |
| 6 | 3D 프린터 | 3D프린터 | 5 | mixed | ok, warning `ANSWER_MIXED_SCRIPT` |
| 7 | 물 | 물 | 1 | hangul | ok (one-character entries are allowed, decision D2) |
| 7b | `---` | (empty) | 0 | | **error** `ANSWER_TOO_SHORT` (nothing left after removing separators) |
| 8 | 사과(과일) | | | | **error** `ANSWER_INVALID_CHAR` (`(`, `)`) |
| 9 | ㄱㄴㄷ | | | | **error** `ANSWER_JAMO` |
| 10 | (empty) | | | | **error** `TERM_EMPTY` |
| 11 | 사과 (second occurrence) | 사과 | 2 | hangul | **error** `DUP_IN_FILE` (first wins, like M1) |
| 12 | `=HYPERLINK(...)` as definition | | | | warning `FORMULA_PREFIX`; stored verbatim, neutralised on export |

Row numbers follow the spreadsheet the teacher sees. M1's `parseStudentCsv` numbers rows after dropping blank records (`line: i + 2` on the filtered table), so after a blank row its numbers drift by one. The M2 parser keeps blank rows in the count (§3.7). M1 is not changed.

---

## 2. Database design

### 2.1 Entities

```
profiles (teacher) 1 ── n content_sets 1 ── n content_entries
                              │ n..1 (optional)
                           classrooms
content_import_batches n ── 1 profiles (actor);   n ── 0..1 content_sets
```

- **content_sets**: a teacher's named word list ("3학년 과학 1단원"). The unit the crossword generator takes as input.
- **content_entries**: one term + definition + the precomputed grid answer.
- **content_import_batches**: the preview/commit ticket, one row per preview (counterpart of `account_batches`; separate table, §3.8 for why).

Raw CSV text is **never stored**. Only parsed, normalised rows are.

### 2.2 Migration plan

The repo has 16 migrations (`20261014000001` … `20261016000003`). The next one is the 17th. Naming follows the repo's `YYYYMMDDNNNNNN_name.sql`; the date part must sort after `20261016000003` (use the real date when written, shown here as 20261017):

| # | File | Contents |
|---|---|---|
| 17 | `20261017000001_content_enums_audit.sql` | enums `content_import_mode`, `content_import_status`, `content_script`; new `audit_resource` and `audit_action` values (§2.8). **Enum values only**: a new enum value cannot be used in the same transaction that adds it, so nothing else goes in this file. Uses the idempotent `DO $$ … IF NOT EXISTS` style of `…07_audit_contract_alignment.sql` |
| 18 | `20261017000002_content_import_batches.sql` | `content_import_batches` (no `set_id` foreign key yet), index, RLS enabled with no policies |
| 19 | `20261017000003_content_sets_entries.sql` | `content_sets`, `content_entries`, indexes, `set_updated_at` triggers, RLS + policies, then `ALTER TABLE content_import_batches ADD CONSTRAINT … FOREIGN KEY (set_id) REFERENCES content_sets(id) ON DELETE SET NULL` (breaks the sets ↔ batches cycle) |
| 20 | `20261017000004_fn_commit_content_import.sql` | `fn_commit_content_import` (SECURITY DEFINER, service role only) and the read views |

Each file is additive; none alters an M1 table. Rollback is `DROP` in reverse order (enum values cannot be removed from Postgres; they are harmless). Also required with the migrations: regenerate `src/types/database.ts`; extend the `AuditAction` / `AuditResource` unions in `src/lib/audit/log.ts`; add pgTAP files `00009_content_sets.test.sql` and `00010_content_import.test.sql` under `supabase/tests/`.

### 2.3 Enums

```sql
CREATE TYPE public.content_import_mode   AS ENUM ('create', 'append', 'replace');
CREATE TYPE public.content_import_status AS ENUM ('previewed', 'completed', 'expired');
CREATE TYPE public.content_script        AS ENUM ('hangul', 'latin', 'digit', 'mixed');
```

`content_import_status` has no `running`: the commit is one database transaction (§3.3), so a half-done batch cannot exist. This removes the "stuck `running` batch" cleanup that M1 needs (`01-batch-size-cap-plan.md` item 7).

### 2.4 `content_sets`

```sql
CREATE TABLE public.content_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  classroom_id uuid REFERENCES public.classrooms(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX idx_content_sets_owner ON public.content_sets (owner_id) WHERE archived_at IS NULL;
CREATE INDEX idx_content_sets_classroom ON public.content_sets (classroom_id) WHERE classroom_id IS NOT NULL;
-- One live title per teacher: lets a teacher pick "the set called X" without ambiguity.
CREATE UNIQUE INDEX uq_content_sets_owner_title_active
  ON public.content_sets (owner_id, lower(btrim(title))) WHERE archived_at IS NULL;

CREATE TRIGGER trg_content_sets_updated_at BEFORE UPDATE ON public.content_sets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

Design notes:
- `owner_id … ON DELETE RESTRICT`, like `classrooms.owner_id` (decision P1: ownership is transferred first). A teacher who owns sets cannot be deleted until Ops transfers the sets to another teacher or deletes them in the end-of-pilot run (§2.9, `12` §3.4, §4.3). Deleting a set cascades to its entries.
- `classroom_id` is optional. A set with `classroom_id = NULL` is private to the owner. Linking a set to a classroom makes it visible to that classroom's owner and co-teachers. `ON DELETE SET NULL` so deleting or archiving a classroom never destroys content. The same-school rule (`set.school_id = classroom.school_id`) is enforced in the service and in `fn_commit_content_import`, as `fn_transfer_enrollment` does for `TRANSFER_CROSS_SCHOOL`; a plain FK cannot express it.
- No counter columns (`entry_count`): they drift. Counts come from the view in §2.7.
- No `language` column: the per-entry `script` already says what the generator needs.

### 2.5 `content_entries`

```sql
CREATE TABLE public.content_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL REFERENCES public.content_sets(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  term text NOT NULL CHECK (char_length(term) BETWEEN 1 AND 60),
  definition text NOT NULL CHECK (char_length(definition) BETWEEN 1 AND 200),
  answer text NOT NULL,
  answer_length smallint GENERATED ALWAYS AS (char_length(answer)) STORED,
  script public.content_script NOT NULL,
  normalizer_version smallint NOT NULL,
  source_line integer,
  import_batch_id uuid REFERENCES public.content_import_batches(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_batch_id uuid REFERENCES public.content_import_batches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT chk_content_entries_answer_grid_safe CHECK (answer ~ '^[가-힣A-Z0-9]+$'),
  CONSTRAINT chk_content_entries_answer_length CHECK (char_length(answer) BETWEEN 1 AND 30)
);

-- Duplicate handling: one live entry per answer per set.
CREATE UNIQUE INDEX uq_content_entries_set_answer_active
  ON public.content_entries (set_id, answer) WHERE archived_at IS NULL;
-- The generator's read path: live entries of one set in file order.
CREATE INDEX idx_content_entries_set_position
  ON public.content_entries (set_id, position) WHERE archived_at IS NULL;
CREATE INDEX idx_content_entries_import_batch ON public.content_entries (import_batch_id);
```

Design notes:
- `answer` has the **database-level** grid-safe `CHECK`. If the TypeScript normaliser has a bug, the generator input is still guaranteed clean. `answer_length` is a **generated column**, so it cannot disagree with `answer`.
- TypeScript's answer bounds (`ANSWER_MIN_LEN = 1`, `ANSWER_MAX_LEN = 15`) are deliberately **tighter** than the database's hard bounds (1–30), so a policy change is a constant edit, not a migration. A test asserts `ANSWER_MAX_LEN <= 30` and `ANSWER_MIN_LEN >= 1`.
- `char_length` counts code points. Entries are stored NFC, so every Hangul syllable is one code point = one grid cell. Decomposing to jamo for a jamo-grid game is lossless later (`normalize(answer, 'NFD')`), so no second column is stored.
- `term` max 60 and `definition` max 200 mirror the TypeScript constants; the `CHECK`s are backstops.
- `position` is the order in the file; append continues after the current maximum.
- `normalizer_version` lets a later rule change re-derive `answer` for old rows with a one-off script, instead of guessing which rows were made under which rule.
- Soft delete: `archived_at` on an entry means "not in the live set". Replace sets it (§3.5). `archived_batch_id` records which import archived it, which makes a future "undo this import" a pure data operation.

### 2.6 `content_import_batches`

```sql
CREATE TABLE public.content_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  set_id uuid,                                   -- NULL until a 'create' import commits
  mode public.content_import_mode NOT NULL,
  status public.content_import_status NOT NULL DEFAULT 'previewed',
  commit_token_hash text NOT NULL,               -- sha256 hex; the raw token is never stored
  rows_hash text NOT NULL,                       -- sha256 hex of mode + target + prepared rows
  source_sha256 text NOT NULL,                   -- sha256 hex of the uploaded bytes (re-upload detection)
  source_bytes integer NOT NULL CHECK (source_bytes > 0),
  total_rows integer NOT NULL CHECK (total_rows > 0),   -- accepted at preview
  accepted_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,       -- duplicates found at commit time
  archived_rows integer NOT NULL DEFAULT 0,      -- 'replace' only
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  completed_at timestamptz
);

CREATE INDEX idx_content_import_batches_actor ON public.content_import_batches (actor_id, created_at DESC);
CREATE INDEX idx_content_import_batches_set   ON public.content_import_batches (set_id, created_at DESC);

ALTER TABLE public.content_import_batches ENABLE ROW LEVEL SECURITY;
-- No policies => service role only (same as account_batches and audit_logs).
```

It contains **no terms or definitions**, only hashes and counts, so it holds no content and no personal data.

### 2.7 RLS and ownership

Scoping rules, all enforced twice (service layer and RLS/function):

| Level | Rule |
|---|---|
| School | every row carries `school_id` (sets, batches); every service query filters `.eq("school_id", profile.school_id)`; `fn_commit_content_import` rejects a set from another school |
| Teacher | `content_sets.owner_id` is the owner. Owner may do everything to the set |
| Classroom | a set linked to a classroom is **visible** to that classroom's **owner** (`classrooms.owner_id`) and its co-teachers (`classroom_teachers`); all of them manage the set like the set owner (decision D3). The classroom owner is not in `classroom_teachers`, so both are checked in the policy and in `fn_commit_content_import`. **Archived classroom = read-only** (decision P2): readable, but not written by anyone |
| Student | **no access** in M2-1: no policy, no grant. Answers must not reach a student's browser before play; a later player design must serve clues without answers |
| Admin | via the service role in server actions, as in M1 (no `authenticated` policy for admins) |

```sql
ALTER TABLE public.content_sets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY content_sets_select_staff ON public.content_sets
  FOR SELECT TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR (
      classroom_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.classroom_teachers ct
        WHERE ct.classroom_id = content_sets.classroom_id
          AND ct.teacher_id = (SELECT auth.uid())
      )
    )
  );

-- Entries inherit visibility from their set: the sub-select runs under the caller's RLS on content_sets.
CREATE POLICY content_entries_select_via_set ON public.content_entries
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.content_sets s WHERE s.id = content_entries.set_id));
```

- All writes go through the service role (server actions) and `fn_commit_content_import`, like M1. No `INSERT/UPDATE/DELETE` policy exists, so a browser client with the anon key and a teacher JWT can read their sets but never write.
- `classroom_teachers` has a self-only select policy and `content_sets` references it, so there is no policy cycle (same reasoning as `classrooms_select_staff`).
- `content_import_batches`: RLS on, no policy.
- The pgTAP test must show: teacher B cannot select teacher A's private set or its entries; a co-teacher of the linked classroom can; a student cannot; `anon` cannot; `authenticated` cannot insert/update/delete.

Read model for the generator and the UI (security-invoker views like `…04_safe_views.sql`):

```sql
CREATE VIEW public.v_content_entries_active WITH (security_invoker = true) AS
SELECT e.set_id, e.id AS entry_id, e.position, e.term, e.definition,
       e.answer, e.answer_length, e.script
FROM public.content_entries e
JOIN public.content_sets s ON s.id = e.set_id
WHERE e.archived_at IS NULL AND s.archived_at IS NULL;

CREATE VIEW public.v_content_sets_summary WITH (security_invoker = true) AS
SELECT s.id AS set_id, s.school_id, s.owner_id, s.classroom_id, s.title, s.archived_at,
       count(e.id) FILTER (WHERE e.archived_at IS NULL)::integer AS entry_count,
       min(e.answer_length) FILTER (WHERE e.archived_at IS NULL) AS min_answer_length,
       max(e.answer_length) FILTER (WHERE e.archived_at IS NULL) AS max_answer_length
FROM public.content_sets s
LEFT JOIN public.content_entries e ON e.set_id = s.id
GROUP BY s.id;
-- REVOKE ALL … FROM PUBLIC, anon; GRANT SELECT … TO authenticated, service_role (as M1).
```

The view deliberately has no `last_import_at`: it would read `content_import_batches`, which has no policy, so an `authenticated` caller would always see `NULL`. The UI reads the last import time with the service role.

**What the generator is promised** (the contract of M2-1): for one `set_id`, `v_content_entries_active` returns rows where `answer` matches `^[가-힣A-Z0-9]+$`, is unique in the set, has `answer_length` between `ANSWER_MIN_LEN` and `ANSWER_MAX_LEN` (database-guaranteed: 1–30), `position` is a stable order, `definition` is non-empty plain text. The generator needs no further cleaning.

### 2.8 De-duplication

Three layers, same canonical key = `answer`:

1. **Inside the file** (preview): first occurrence wins; later ones are rejected with `DUP_IN_FILE` (identical definition) or `DUP_IN_FILE_CONFLICT` (different definition), naming the first row. Same approach as M1 `buildPreview`.
2. **Against the set** (preview, informational): `DUP_EXISTING` for `append`; not applicable for `create` and `replace` (the old live entries are archived).
3. **At commit** (authoritative): the unique partial index `uq_content_entries_set_answer_active` with `INSERT … ON CONFLICT DO NOTHING`. Another commit that landed between preview and commit therefore cannot create a duplicate; the row is counted in `skipped_rows` and shown in the result. This is not an error.

The entry is never silently overwritten: a different definition for an existing answer needs an explicit edit or `replace` (an "update definitions" mode is deferred, §10 D6).

### 2.9 Soft delete, archive, retention and erasure

| Item | Rule |
|---|---|
| Archive a set | `content_sets.archived_at = now()`; hidden from lists and from the generator view; entries untouched; reversible (`classroom.archived/unarchived` pattern) |
| Archive an entry | only through `replace` in M2-1 (single-entry edit/delete UI is later); `archived_at` + `archived_batch_id` |
| Hard delete | not offered in the UI. Done only by the retention procedure below |
| Archived entries and sets | **Archive only, no purge** (decision D5). They stay in the database, hidden from lists and from the generator view, until the end-of-pilot deletion removes them with the owning teacher (below). No scheduled or manual purge step is added to the Ops runbook |
| Expired `previewed` batches | marked `expired` at commit attempt like M1; a monitoring query lists rows `previewed` older than `expires_at`; Ops may delete them (they hold only hashes) |

Interaction with `docs/pilot/12-d6-data-governance-policy.md` (signature still pending, so this is a **proposal for the next revision**, not an edit of that document):

- **Is content personal data?** Intended no: vocabulary and clues written by a teacher. But it is free text, and §1 of the policy says "No free-text profiles"/"What is not collected". A teacher could paste a student's name into a term or clue. Mitigation: a Korean notice on the import page (§3.6), a data-governance row added to `12` §0.1 ("Content sets and entries — `content_sets`, `content_entries` — teacher-authored, should not contain personal data — removed with the owning teacher's profile (cascade)"), and a sentence in the §1 consent policy that content must not contain students' personal data. The school's data-protection contact must confirm.
- **End-of-pilot deletion** (`12` §3.4): `content_sets.owner_id` is `RESTRICT` (decision P1), so the run deletes `content_sets` (which removes their entries; batches keep only counts and lose `set_id`) **before** it deletes teachers. A single departing teacher's sets are transferred to another teacher first (`12` §4.3). Add `content_sets` to the verify query, expecting 0. Teachers may download their sets first (D14).
- **Single student erasure** (`12` §3.3): content never references a student, so nothing to do.
- **Audit logs**: content audit rows hold **no terms or definitions**, only counts, ids and hashes (§2.10). They need no de-identification and fall under the existing 1-year rule.
- **Backups**: same statement as `12` §3.5.
- **Retention clock**: 30 days after the pilot end date, with everything else. No separate retention for content in the pilot.

### 2.10 Audit actions to add

New enum values (migration 17), mirrored in `src/lib/audit/log.ts`:

| `audit_resource` (new) | |
|---|---|
| `content_set` | the set and anything done to it, including imports (`resource_id` = set id) |

(Imports are also linked to the existing `batch` resource through `metadata.batchId`; no second new resource is needed.)

| `audit_action` (new) | When | `resource_type` / `resource_id` | `metadata` (never terms or definitions) |
|---|---|---|---|
| `content_set.created` | a `create` import commits | `content_set` / set id | `{ schoolId, batchId, entryCount }` |
| `content_set.updated` | title or classroom link changed | same | `{ fields: ["title"] }` |
| `content_set.archived` | set archived | same | `{ entryCount }` |
| `content_set.unarchived` | set restored | same | `{}` |
| `content_set.import_completed` | any import commits (written inside `fn_commit_content_import`) | same | `{ schoolId, batchId, mode, accepted, skipped, archived, warnings, sourceSha256, sourceBytes }` |
| `content_set.import_rejected` | commit refused (token, expiry, hash, cap, forbidden) | `content_set` or `batch` | `{ batchId, code }` — best effort, written by the server action |

`audit_logs.classroom_id` is filled when the set is linked to a classroom. Preview is not audited (M1 does not audit preview either); the batch row shows it happened.

---

## 3. Upload workflow

### 3.1 Flow

```
 file ──► previewContentImportAction ──► preview (rows + counts + token)
                                              │ teacher reads it, confirms
 file + token + mode + target ──► commitContentImportAction ──► summary
```

Both actions are in `src/features/content/import/actions.ts` with `"use server"`, return a state object (`{ ok, error?, … }`) for `useActionState`, authorise with `requireTeacherArea()` first, and turn known errors into messages and rethrow everything else, exactly like `src/features/accounts/batch/actions.ts`.

### 3.2 Preview action: `previewContentImportAction(prev, formData)`

Form fields: `file` (File) — or `csv` (pasted text) as M1 supports; `mode` = `create | append | replace`; `setId` (append/replace); `newSetTitle` (create); `classroomId` (optional link).

Steps, nothing is written until the last one:

1. `authorize()` → `ContentImportErrorCode FORBIDDEN` state on failure.
2. Validate `mode` and target: `create` needs a valid `newSetTitle` and no live set of that title; `append`/`replace` need `setId` that the actor may manage and that is not archived (`requireManageableContentSet`, written like `requireManageableClassroom`); `classroomId`, if given, must pass `requireManageableClassroom` and be in the actor's school.
3. Read the bytes: `file.size` is checked **before** reading (`FILE_TOO_LARGE`), then `arrayBuffer()`. Decode strictly (§4.6). For the pasted-text fallback, use the string and the same byte-length check.
4. Parse (§3.7), find header, enforce `MAX_CONTENT_ROWS` (`TOO_MANY_ROWS`).
5. Prepare every row (§4.2) and validate (§4.3–4.5). For `append`, load the set's live `answer` keys and flag `DUP_EXISTING`. For `append` and `replace`, check that `live + accepted ≤ MAX_SET_ENTRIES` (replace: `accepted ≤ MAX_SET_ENTRIES`) and report `SET_TOO_LARGE` now so the teacher is not surprised at commit.
6. If there is at least one valid row: `createContentImportPreview` stores the batch (hashed token, rows hash, source hash) and returns `{ batchId, commitToken, expiresAt }`. If none: return `{ ok: true, preview }` without a token and with `NO_VALID_ROWS` shown, as M1 does.

### 3.3 Commit action: `commitContentImportAction(prev, formData)`

The client sends the **same file again** plus `batchId`, `commitToken`, `mode`, `setId`/`newSetTitle`, `classroomId`, and (replace) `confirmReplace`. The server never trusts the earlier preview:

1. `authorize()`; re-check the set and classroom (they may have been archived since the preview), exactly as M1 re-checks the classroom.
2. Re-read, re-decode, re-parse, re-prepare the file with the **same code** as preview, which re-applies the byte cap, the row cap and every row rule (cap enforced at both points, as for R2).
3. `replace` without `confirmReplace=true` → `REPLACE_NOT_CONFIRMED`.
4. Compute `rows_hash` (below) and call the database function `fn_commit_content_import(...)` once.

Rows hash (same idea as `hashRows` in `batch-service.ts`, which includes the classroom so a token cannot be replayed elsewhere):

```
header = normalizerVersion US mode US setId US newTitle US classroomId     (missing values are empty; US = U+001F)
body   = term US definition, rows joined by RS (U+001E), in row order
hash   = sha256_hex(header GS body)                                        (GS = U+001D)
```

*Implemented in M2-1.2:* `canonicalRowsText()` in `rows-hash.ts` builds this text and `public.fn_content_rows_hash()` builds the **same** text in SQL. `fn_commit_content_import` recomputes the hash from the rows it is about to insert and compares it with the stored one, so the rows can no longer differ from the previewed ones even if a caller passes a matching `p_rows_hash` (review finding F5). A test compares the TypeScript and SQL results on the real database. The hash covers the rows that are valid inside the file, **including** answers the set already has (the database skips those), so it does not change when another import lands between preview and commit.

*Preview tickets (M2-1.2):* at most `MAX_ACTIVE_PREVIEWS` (10) live previews per teacher (the oldest are marked expired); tickets that were never committed are deleted 24 hours after they expire by `fn_cleanup_content_import_batches()`, which runs whenever a preview is created. Completed batches are kept as the import history.

`fn_commit_content_import(p_batch_id, p_actor_id, p_school_id, p_token_hash, p_rows_hash, p_mode, p_set_id, p_new_title, p_classroom_id, p_rows jsonb, p_max_entries int)` runs **in one transaction** and does, in order:

1. `SELECT … FOR UPDATE` the batch row; require `status = 'previewed'`, `actor_id`, `school_id`, `commit_token_hash`, `rows_hash` equal, `mode` equal, not expired. Mismatch raises a named exception the TypeScript service maps to `BATCH_NOT_FOUND`, `COMMIT_TOKEN_INVALID`, `BATCH_EXPIRED` or `ROWS_CHANGED` (messages as M1). Expired → set `status = 'expired'` (that update is the one thing that must survive; do it before raising, or in the service on the mapped error, as M1 does).
2. Check the actor is an active `teacher`/`admin` (like `fn_transfer_enrollment`), and for `append`/`replace` that they own the set or co-teach its classroom (owner, admin, or co-teacher of the linked classroom: decision D3), the set is not archived and in the same school.
3. `create`: insert the set (unique title index protects against races → `TITLE_DUPLICATE`). `append`/`replace`: `SELECT … FOR UPDATE` the set row, which **serialises concurrent imports into the same set**.
4. `replace`: `UPDATE content_entries SET archived_at = now(), archived_batch_id = p_batch_id WHERE set_id = … AND archived_at IS NULL`; count into `archived_rows`.
5. Insert rows from `p_rows` with `ON CONFLICT (set_id, answer) WHERE archived_at IS NULL DO NOTHING`; `position` continues from the current maximum; count inserted / skipped.
6. Check `live count ≤ p_max_entries` (the cap passed from TypeScript `MAX_SET_ENTRIES`; no literal in SQL). Over → `RAISE EXCEPTION 'SET_TOO_LARGE'`, the whole transaction rolls back: no partial import, the token stays usable.
7. Update the batch row (`status = 'completed'`, counts, `completed_at`, `set_id`), insert the audit row(s) (§2.10), return a jsonb summary.

Because it is one transaction there is no `running` state and no "timed out half way" case. It is fast: one statement for the insert at ≤ `MAX_CONTENT_ROWS` rows.

### 3.4 Single-use token

Identical mechanism to M1: 32 random bytes, `base64url`, only `sha256` stored, 15-minute lifetime (reuse `COMMIT_TOKEN_TTL_MINUTES` or a sibling constant), claimed atomically (here by the row lock and the status change in the same transaction). A second commit with the same token finds `status = 'completed'` → `BATCH_NOT_FOUND` ("이미 사용되었습니다"). Replaying the token with another file, mode, set or classroom changes `rows_hash` → `ROWS_CHANGED`.

### 3.5 Create / append / replace semantics

| Mode | Target | Existing live entries | Duplicate answers | Result |
|---|---|---|---|---|
| `create` | new set (title required; optional classroom) | none | within file only | new set with N entries |
| `append` | existing set | kept | already-present answers are **skipped**, not updated | set grows; `position` continues |
| `replace` | existing set | **archived** (not deleted) with this batch id, then the file's rows inserted | within file only | set content = the file; previous content stays archived and recoverable by Ops (archive only, D5) |

Rules:
- `replace` requires an explicit confirmation checkbox showing the number of entries that will be archived.
- Re-uploading the same file: preview compares `source_sha256` with completed batches of that set and shows the notice "이 파일은 {날짜}에 이미 올렸습니다." For `append` it would produce only skips anyway; for `replace` it is allowed (a legitimate "reset").
- Partial files: as in M1, rows with errors are **left out**, valid rows commit. The preview shows exactly what will be left out, and the commit button text includes the numbers ("오류 {n}개를 제외하고 {m}개 저장").
- A set's size limit applies after the operation (`MAX_SET_ENTRIES`).
- Undo of an import is not built; the data supports it (`import_batch_id` / `archived_batch_id`), see §10 D8.

### 3.6 UI states

Page: `/teacher/content/import` (new set) and `/teacher/content/[setId]/import` (append/replace), plus a list at `/teacher/content`. Component `src/components/teacher/content-import-form.tsx`. The limits arrive as **props from the server page** (`maxRows`, `maxCsvBytes`, `maxSetEntries`, `maxTermChars`, `maxDefinitionChars`, `answerMinLen`, `answerMaxLen`), imported from `content-schemas.ts`; no literal in the component (the pattern of `import/page.tsx` for M1).

| State | Shown | Notes |
|---|---|---|
| Idle | file picker, mode radios, set title or set name, optional classroom, help text with the limits, the privacy notice | help text: "UTF-8 CSV, 첫 줄에 term, definition 열이 필요합니다. 한 번에 최대 {maxRows}개, {maxKB}KB까지 올릴 수 있습니다." and "학생 이름·학번 등 개인정보는 넣지 마세요." |
| File too big (client) | inline error under the picker | quick pre-check with `file.size` like M1's `onFile`; the server repeats it |
| Previewing | button disabled, "확인하는 중…" | `useActionState` pending |
| File-level error | red alert with the §4.8 message; no token; form stays | the teacher fixes the file and re-selects |
| Preview, no valid rows | counts + rejected table; commit disabled | `NO_VALID_ROWS` |
| Preview, ok | summary chips (정상 / 경고 / 제외), table of accepted rows with answer and length, table of rejected rows with messages, expiry time, mode summary, commit button | `replace` shows the archive count + checkbox |
| Expired token | alert `BATCH_EXPIRED` + "다시 미리보기" button that re-submits the file in the form | form still holds the file |
| Committing | commit button disabled | prevents double submit; the token is single-use anyway |
| Done | result: 저장 {n}개, 건너뜀 {n}개(이미 있음), 보관 {n}개; link "세트 보기" | no credential sheet (no secrets here) |
| Commit error | alert with the mapped message | `SET_TOO_LARGE`, `ROWS_CHANGED`, `BATCH_NOT_FOUND` … |

Optional: "오류 행 CSV 내려받기" (rejected rows + messages) using `escapeCsvCell`. Not required for M2-1.

### 3.7 What is reused and what deliberately differs from M1

| Piece | M1 file | M2-1 | Why |
|---|---|---|---|
| CSV tokenizer `parseCsv` | `csv-parse.ts` | **Reuse the algorithm**, but move it to a shared `src/lib/csv/parse.ts` with an option to keep blank records and report each record's row number. The M1 export stays as a thin re-export so M1 behaviour and tests do not change. Do this move **after** M1 release closes; until then M2 may not touch M1 files | M1 drops blank records before numbering rows (`line: i + 2`), so row numbers drift |
| Header lookup by alias | `HEADER_ALIASES` | same pattern, new aliases (§1.1) | |
| Row cap + byte cap constants | `batch-schemas.ts` (`MAX_BATCH_ROWS`, `MAX_CSV_BYTES`) | new `content-schemas.ts` constants (§4.7). **Not** the M1 constants: different reason for the limit | M1's 30 is bound by sequential account creation time; content has no such cost |
| Cap enforcement points | parser + zod `.max()` at preview and commit | same: parser, a zod run schema `.max(MAX_CONTENT_ROWS)`, plus `p_max_entries` into SQL | R2 pattern |
| Limits to UI | props from page | same | |
| Byte cap check | after `file.text()` on the decoded string | **before reading** (`file.size`) and again on the bytes | avoids decoding a huge file; counts real bytes |
| File reading | the **browser** reads the file and posts the text in a hidden `csv` field | the browser posts the **File** itself; the server decodes | only the server can detect a non-UTF-8 file; browser `file.text()` silently turns EUC-KR into `�` |
| Preview/commit split + token | `createBatchPreview` / `commitStudentBatch`, `account_batches` | same shape, separate table `content_import_batches` | `account_batches` has `total_rows > 0`, account-specific counts and no `mode`/`set_id`; widening it would touch an M1 table |
| Commit mechanics | TypeScript loop, per-row Auth Admin calls, status `running` | **one SQL function, one transaction**, no `running` | no external API per row, so atomicity is possible and removes the stuck-batch case |
| Token compare | `timingSafeEqual` in TypeScript | SQL equality of two sha256 hashes in the function | hash-to-hash, nothing secret to time |
| Audit | `writeAuditLog` from the service | written inside the function for the success path (atomic with the data); `writeAuditLog` for rejections | audit cannot be lost or exist without the data |
| Partial success | per-row isolation, invalid rows skipped | invalid rows skipped at **preview**; the DB step is all-or-nothing | M1 rows are independent accounts; here a half-applied `replace` would be worse than none |
| Credential sheet | yes | none | no secrets |
| Error class | `BatchError` / `BatchErrorCode` | new `ContentImportError` / `ContentImportErrorCode` in `import-errors.ts` | keep M1 enum frozen |
| Row-level validation | zod `batchRowSchema` | zod schema for the length/char rules + the normaliser (§4) | |

Proposed files (`src/features/content/`): `domain.ts`, `import/content-schemas.ts` (constants, zod, types), `import/csv-decode.ts`, `import/csv-parse.ts`, `import/normalize.ts`, `import/preview.ts`, `import/import-service.ts`, `import/import-errors.ts`, `import/actions.ts` (`"use server"`), `sets/service.ts`, `sets/queries.ts`, `sets/actions.ts` (rename, link/unlink classroom, archive, unarchive).

### 3.8 Error states summary

Every error returns a state `{ ok: false, error }`; none throws to the user. Unknown errors are rethrown (as M1). No error path writes entries. Errors after the token is issued leave the token valid until it expires, **except** a successful commit, which consumes it.

---

## 4. Validation rules

Severity: **error** = the row is left out (file-level errors reject the whole file); **warning** = the row is kept and the teacher is told. Row errors do not stop other rows.

### 4.1 Field rules (after cleaning, §4.2)

| Field | Rule | Code | Severity |
|---|---|---|---|
| term | empty | `TERM_EMPTY` | error |
| term | more than `TERM_MAX_CHARS` (60) characters | `TERM_TOO_LONG` | error |
| definition | empty | `DEFINITION_EMPTY` | error |
| definition | more than `DEFINITION_MAX_CHARS` (200) characters | `DEFINITION_TOO_LONG` | error |
| row | fewer cells than the header needs | `ROW_TOO_FEW_COLUMNS` | error |
| answer | shorter than `ANSWER_MIN_LEN` (1; only an answer that is empty after removing separators) | `ANSWER_TOO_SHORT` | error |
| answer | longer than `ANSWER_MAX_LEN` (15) | `ANSWER_TOO_LONG` | error |
| answer | contains a character outside `가-힣 A-Z 0-9` after §4.2 | `ANSWER_INVALID_CHAR` | error (lists up to 5 offending characters) |
| answer | contains Hangul jamo (ㄱ, ㅏ, conjoining jamo) | `ANSWER_JAMO` | error |
| answer | numeric-like term (decimal point or comma between digits; digits with signs, dots, commas, hyphens only) | `ANSWER_NUMERIC_LIKE` | error |
| answer | mixes Hangul with Latin/digits | `ANSWER_MIXED_SCRIPT` | warning |
| definition | contains the answer text (the clue gives the word away); not checked when the answer has one character, where it would only add noise | `DEFINITION_CONTAINS_ANSWER` | warning |
| definition | starts with `= + - @` or a tab (spreadsheet formula look-alike) | `FORMULA_PREFIX` | warning |
| term/definition | control or invisible characters were removed | `CONTROL_CHARS_REMOVED` | warning |
| term/definition | line breaks or repeated spaces were collapsed | `WHITESPACE_NORMALISED` | warning |
| row | same answer as an earlier row, same definition | `DUP_IN_FILE` | error |
| row | same answer as an earlier row, different definition | `DUP_IN_FILE_CONFLICT` | error |
| row | answer already live in the set (append only) | `DUP_EXISTING` | error (skipped) |

Both `TERM_*` and `DEFINITION_*` lengths count characters (code points), not bytes. All rules for a row are evaluated and all messages are shown, as M1's zod issues are.

### 4.2 Normalisation (one pure function, `normalize.ts`, versioned by `NORMALIZER_VERSION = 1`)

For each of term and definition ("display cleaning"):

1. Remove NUL and other C0/C1 control characters (keep `\t \n \r` for step 3), zero-width and direction marks (`U+00AD`, `U+200B–200F`, `U+202A–202E`, `U+2060–2064`, `U+2066–2069`, `U+FEFF`). If anything was removed → warning `CONTROL_CHARS_REMOVED`. (`U+0000` must never reach Postgres: `text` cannot hold it and the insert would fail.)
2. Unicode **NFC**. This turns decomposed Hangul (what macOS file names and some copy-paste produce) into normal syllables. Without it, "사과" typed on a Mac can be six code points and never match "사과".
3. Replace every run of whitespace (space, tab, CR, LF, `U+00A0`, `U+3000`) by one space, trim. If a line break or a run was collapsed → warning `WHITESPACE_NORMALISED` (plain trimming is silent).

Result is `term` / `definition` as stored and shown.

Additionally, for **term only**, to get `answer`:

4. Convert fullwidth ASCII (`U+FF01–FF5E`) to ASCII by code-point offset. (Not full NFKC: NFKC would also turn `①` into `1` and `㈜` into `(주)`, which should be rejected, not rewritten.)
5. Remove separators that are never grid cells: space, `-`, `U+2010–2015`, `'`, `U+2019`, `.`, `·`, `U+318D (ㆍ)`, `_`. Before this step, a **numeric-like** term is refused (`ANSWER_NUMERIC_LIKE`, decision P3): a `.` or `,` between two digits anywhere (`1.5`, `3.14`, `1,000`, `v1.2`), or a term made only of digits with signs, dots, commas or hyphens (`-5`, `2024-10-17`, `010-1234-5678`). Otherwise removing the separators would turn `1.5` into `15`. Plain digits and digits next to letters are not numeric-like.
6. Upper-case Latin letters (locale-independent `toUpperCase`).
7. Check for jamo on the result of steps 4–6 (separators are gone by then, so `ㆍ` / `U+318D` is not mistaken for a jamo) → `ANSWER_JAMO`. Conjoining jamo that NFC composes into a real syllable are already syllables and pass.
8. Validate against `^[가-힣A-Z0-9]+$`; collect offending characters for `ANSWER_INVALID_CHAR`.
9. `answerLength` = number of code points; check bounds; compute `script`: all 가-힣 → `hangul`, all A-Z → `latin`, all 0-9 → `digit`, else `mixed` (+ warning).

Hangul syllable = one grid cell is an **assumption** (§9 A4). Decomposing for a jamo grid is possible later without migration.

Examples: `"  Ice   Cream "` → term `Ice Cream`, answer `ICECREAM`. `"ＡＢＣ"` → term unchanged (NFC), answer `ABC`. `"한국어(韓國語)"` → `ANSWER_INVALID_CHAR` (`( ) 韓 國 語`). `"e-mail"` → `EMAIL`. `"O'Neil"` → `ONEIL`. `"3.14"` → answer `314` (digit), accepted with the answer shown in the preview so the teacher can see what the generator will use.

### 4.3 Duplicate rules

Key is `answer`. See §2.8 for the three layers. Messages name the row of the first occurrence. Comparison is after normalisation, so `사과`, ` 사과 ` and (decomposed) `사과` are one key, and `Apple` / `APPLE` / `apple` are one key.

### 4.4 Injection and formula safety

- **SQL**: rows reach the database only as a typed `jsonb` parameter to `fn_commit_content_import` (and parameterised client calls). No string-built SQL.
- **HTML/script**: content is plain text. It is rendered only through React text nodes; `dangerouslySetInnerHTML` is not allowed for content. Characters `< > & "` are legal in definitions and are not stripped (stripping would corrupt "x < 5" in a maths set).
- **CSV/spreadsheet formulas**: stored verbatim and **neutralised on output**. Any CSV the app writes (error report, set export) passes every cell through `escapeCsvCell` (`credential-export.ts`: leading `= + - @ \t \r` gets a `'` prefix, then CSV quoting). On input a leading formula character in `definition` gives a warning; in `term` it is already rejected because `= + @` are not allowed answer characters (and `-` as the first character of an otherwise valid word is removed as a separator, so `-사과` gives answer `사과`, term shown as written). **Round trip (M2-1.5):** the export writes a cell that starts with `= + - @` with a leading apostrophe (`'=1+1`), and the importer removes an apostrophe that stands directly before one of those four characters (`stripFormulaGuard`), so export -> import gives back the stored text exactly. Any other leading apostrophe is ordinary text.
- **Invisible text**: step 1 removes bidi controls and zero-width characters that could make a stored clue display differently from what was reviewed.
- **Size/DoS**: byte cap checked on `file.size` before reading; row cap checked right after parsing; the parser is linear.

### 4.5 File-level rules

| Rule | Code |
|---|---|
| no file and no pasted text | `FILE_MISSING` |
| zero bytes / only blank records | `EMPTY_FILE` |
| bytes > `MAX_CONTENT_CSV_BYTES` | `FILE_TOO_LARGE` |
| invalid UTF-8 | `ENCODING_INVALID` |
| UTF-16 BOM | `ENCODING_UTF16` |
| header is one column that contains `;` or a tab | `DELIMITER_UNSUPPORTED` |
| unclosed quote | `CSV_MALFORMED` |
| text right after a closing quote (`"abc"def`) | `CSV_QUOTE_MISPLACED` |
| `term` or `definition` column missing | `MISSING_HEADER` |
| a column name appears twice | `DUPLICATE_HEADER` |
| header only, no data rows | `NO_DATA_ROWS` |
| data rows > `MAX_CONTENT_ROWS` | `TOO_MANY_ROWS` |
| no row survived validation | `NO_VALID_ROWS` |

Extra columns are not an error: notice "term, definition 외의 열 {n}개는 무시됩니다."

### 4.6 Encoding detection (EUC-KR / CP949 garbling)

Excel's Korean "CSV (쉼표로 분리)" saves as **CP949**. Read as UTF-8 by the browser (`file.text()`), the Hangul becomes `�` and the file looks "uploaded fine" but is unreadable. M2 therefore:

1. Receives the raw bytes (the browser sends the File, §3.7).
2. Removes a UTF-8 BOM; if the first bytes are `FF FE` or `FE FF` → `ENCODING_UTF16`.
3. Decodes with `fatal: true`. CP949 Hangul (lead byte `B0–C8`, then `A1–FE`) is not valid UTF-8, so the decode throws → `ENCODING_INVALID`. Pure-ASCII files are valid in both and need no detection.
4. After decoding, any remaining `U+FFFD` in the text (a file that contained a literal replacement character) → `ENCODING_INVALID`.

It does **not** silently guess CP949. A wrong guess would store corrupt Korean; the message tells the teacher how to resave. Automatic CP949 fallback (`new TextDecoder("euc-kr")`) is possible and is §10 D4.

### 4.7 Limits (one source file, enforced at preview and commit)

All in `src/features/content/import/content-schemas.ts`, like `batch-schemas.ts`:

```ts
export const MAX_CONTENT_ROWS = 100;                 // words per CSV
export const MAX_CONTENT_CSV_BYTES = 128 * 1024;     // 128 KB
export const MAX_SET_ENTRIES = 200;                  // live words in one set
export const TERM_MAX_CHARS = 60;
export const DEFINITION_MAX_CHARS = 200;
export const ANSWER_MIN_LEN = 1;
export const ANSWER_MAX_LEN = 15;
export const NORMALIZER_VERSION = 1;
```

Reasoning for the numbers (proposals, §10 D1): a crossword grid rarely uses more than 20–30 words; 100 rows per file and 200 per set leave room for a vocabulary list that is later subdivided. The row cap is **not** tied to M1's 30 (that is the account-creation time limit of `01-batch-size-cap-plan.md`); here the commit is one transaction of ≤ 100 inserts. Worst-case bytes: 100 rows × (60 + 200 characters × 3 bytes + quoting) ≈ 80 KB, so 128 KB leaves headroom for blank rows and extra columns. Next.js Server Actions accept 1 MB bodies by default (`next.config` sets no `bodySizeLimit`), so the file fits.

Enforcement points (the R2 pattern):

| Point | Rows | Bytes | Set size |
|---|---|---|---|
| Client picker | — | `file.size` (convenience only) | — |
| Preview, `readContentFile` | — | `file.size`, then decoded bytes | — |
| Preview, `parseContentCsv` | `TOO_MANY_ROWS` | | |
| Preview, `buildContentPreview` | | | `SET_TOO_LARGE` |
| Commit (same functions again) | yes | yes | yes |
| zod run schema `.max(MAX_CONTENT_ROWS)` | yes | | |
| `rows_hash` binds commit to the previewed rows | cannot raise cap between steps | | |
| SQL `p_max_entries` (from `MAX_SET_ENTRIES`) | | | atomic re-check |
| SQL `CHECK`s | | | answer 1–30, term ≤ 60, definition ≤ 200 |

The UI receives all numbers as props; error text interpolates the same constants.

### 4.8 Exact Korean messages

File-level (`ContentImportErrorCode` → message; `${…}` are filled from the constants or the file):

| Code | Message |
|---|---|
| `FILE_MISSING` | CSV 파일을 선택해 주세요. |
| `EMPTY_FILE` | 비어 있는 파일입니다. |
| `FILE_TOO_LARGE` | 파일이 너무 큽니다. 최대 ${MAX_CONTENT_CSV_BYTES/1024}KB까지 올릴 수 있습니다. |
| `ENCODING_INVALID` | 파일 인코딩을 읽을 수 없습니다. 엑셀에서 ‘CSV UTF-8(쉼표로 분리)’ 형식으로 다시 저장해 주세요. |
| `ENCODING_UTF16` | UTF-16 형식의 파일입니다. ‘CSV UTF-8(쉼표로 분리)’ 형식으로 다시 저장해 주세요. |
| `DELIMITER_UNSUPPORTED` | 쉼표(,)로 구분된 CSV 파일만 올릴 수 있습니다. 탭이나 세미콜론으로 구분된 파일은 쉼표로 다시 저장해 주세요. |
| `CSV_MALFORMED` | 따옴표가 닫히지 않았습니다. |
| `CSV_QUOTE_MISPLACED` | 따옴표(") 뒤에는 쉼표나 줄바꿈만 올 수 있습니다. 따옴표가 들어가는 글자는 ""처럼 두 번 써 주세요. |
| `MISSING_HEADER` | 첫 줄에 term(용어)와 definition(뜻) 열이 필요합니다. |
| `DUPLICATE_HEADER` | 같은 이름의 열이 두 번 있습니다. |
| `NO_DATA_ROWS` | 단어 행이 없습니다. |
| `TOO_MANY_ROWS` | 단어가 ${n}개입니다. 한 번에 최대 ${MAX_CONTENT_ROWS}개까지 올릴 수 있습니다. 파일을 ${MAX_CONTENT_ROWS}개 이하로 나누어 올려 주세요. |
| `NO_VALID_ROWS` | 저장할 수 있는 단어가 없습니다. 오류를 고친 뒤 다시 올려 주세요. |
| `MODE_INVALID` | 올바르지 않은 저장 방식입니다. |
| `TITLE_INVALID` | 세트 이름은 1~80자로 입력해 주세요. |
| `TITLE_DUPLICATE` | 같은 이름의 세트가 이미 있습니다. |
| `SET_NOT_FOUND` | 단어 세트를 찾을 수 없습니다. |
| `SET_ARCHIVED` | 보관된 세트는 수정할 수 없습니다. |
| `CLASSROOM_ARCHIVED` | 보관된 학급의 세트는 수정할 수 없습니다. |
| `SET_TOO_LARGE` | 세트에는 단어를 최대 ${MAX_SET_ENTRIES}개까지 담을 수 있습니다. (현재 ${current}개, 추가 ${add}개) |
| `REPLACE_NOT_CONFIRMED` | 기존 단어를 보관 처리하려면 확인란을 선택해 주세요. |
| `FORBIDDEN` | 해당 작업 권한이 없습니다. |
| `BATCH_NOT_FOUND` | 유효한 미리보기를 찾을 수 없거나 이미 사용되었습니다. |
| `COMMIT_TOKEN_INVALID` | 확인 토큰이 올바르지 않습니다. |
| `BATCH_EXPIRED` | 미리보기가 만료되었습니다. 다시 미리보기를 실행해 주세요. |
| `ROWS_CHANGED` | 미리보기 이후 파일 내용이 변경되었습니다. |
| `BATCH_PERSIST_FAILED` | 미리보기를 저장하지 못했습니다. |

(The last four and `BATCH_NOT_FOUND` reuse the M1 wording word for word, so the two features read the same.)

Row-level (shown in the rejected/warning tables, prefixed in the UI with "{line}행:"):

| Code | Message |
|---|---|
| `TERM_EMPTY` | 용어가 비어 있습니다. |
| `TERM_TOO_LONG` | 용어가 너무 깁니다. (최대 ${TERM_MAX_CHARS}자) |
| `DEFINITION_EMPTY` | 뜻이 비어 있습니다. |
| `DEFINITION_TOO_LONG` | 뜻이 너무 깁니다. (최대 ${DEFINITION_MAX_CHARS}자) |
| `ROW_TOO_FEW_COLUMNS` | 열이 부족합니다. 용어와 뜻을 모두 입력해 주세요. |
| `ANSWER_TOO_SHORT` | 낱말 퍼즐 정답은 최소 ${ANSWER_MIN_LEN}글자여야 합니다. |
| `ANSWER_TOO_LONG` | 낱말 퍼즐 정답은 최대 ${ANSWER_MAX_LEN}글자까지 가능합니다. (현재 ${n}글자) |
| `ANSWER_INVALID_CHAR` | 정답에 쓸 수 없는 문자가 있습니다: ${chars}. 한글, 영문, 숫자만 사용할 수 있습니다. |
| `ANSWER_JAMO` | 자음/모음만 따로 쓴 글자는 정답에 쓸 수 없습니다. 완성된 글자로 입력해 주세요. |
| `ANSWER_NUMERIC_LIKE` | 소수점·쉼표·하이픈이 들어간 숫자 형태(1.5, 3.14, 2024-10-17 등)는 정답으로 쓸 수 없습니다. |
| `ANSWER_MIXED_SCRIPT` (경고) | 한글과 영문/숫자가 섞여 있습니다. 퍼즐 종류에 따라 제외될 수 있습니다. |
| `DEFINITION_CONTAINS_ANSWER` (경고) | 뜻에 정답이 그대로 들어 있습니다. (정답이 1글자이면 검사하지 않습니다) |
| `FORMULA_PREFIX` (경고) | 뜻이 수식 기호(=, +, -, @)로 시작합니다. 그대로 저장되며, 내려받을 때는 안전하게 변환됩니다. |
| `CONTROL_CHARS_REMOVED` (경고) | 보이지 않는 제어 문자를 제거했습니다. |
| `WHITESPACE_NORMALISED` (경고) | 줄바꿈이나 반복된 공백을 하나의 공백으로 바꿨습니다. |
| `DUP_IN_FILE` | 같은 정답이 ${first}행에 이미 있습니다. |
| `DUP_IN_FILE_CONFLICT` | 같은 정답이 ${first}행에 있고 뜻이 다릅니다. 하나만 남겨 주세요. |
| `DUP_EXISTING` | 이미 세트에 있는 단어입니다. 건너뜁니다. |

Commit-time skips (shown in the result): "{n}개는 그 사이 세트에 추가되어 건너뛰었습니다."

Preview/summary texts: "정상 {a}개 · 경고 {b}개 · 제외 {c}개"; commit button "{m}개 저장"; with exclusions "오류 {c}개를 제외하고 {m}개 저장"; replace: "기존 단어 {k}개를 보관 처리하고 {m}개로 바꿉니다."; privacy notice: "학생 이름, 학번 등 개인정보는 넣지 마세요."; notice for a repeated file: "이 파일은 {날짜}에 이미 올렸습니다."; extra columns: "term, definition 외의 열 {n}개는 무시됩니다."

---

## 5. Storage model

**Where each kind of data lives**

| Data | Store | Kept how long | Notes |
|---|---|---|---|
| Word sets and entries | Postgres: `content_sets`, `content_entries` | while the owner exists; archived rows kept until the pilot-end deletion (§2.9, D5) | the only durable copy of the content |
| Import tickets | Postgres: `content_import_batches` | hashes and counts only; deletable once expired | no content, no personal data |
| Audit trail | Postgres: `audit_logs` | 1 year (policy `12` §2) | no terms or definitions in `metadata` |
| The uploaded CSV file | **nowhere** | discarded when the request ends | decided: no Supabase Storage bucket |
| Generated artifacts (questions, crosswords, game rounds) | not in M2-1 | | §7 states what they must reference |

**Why the raw CSV is not stored.** The parsed rows are the content; the file adds nothing the generator needs. Keeping files would create a second copy to protect, to retain on the 30-day clock and to erase, and a file may contain rejected rows the teacher never meant to keep. What is kept instead is `source_sha256` and `source_bytes` per import, enough to detect "this file was uploaded before" (§3.5) and to correlate support questions without holding the file. If the school later wants originals kept (for example for dispute handling), that is a new decision with its own retention entry in `12`, not a silent addition (D13).

**Size estimate.** Worst case per entry about 0.8 KB of text plus indexes, roughly 1.5 KB. A set is at most `MAX_SET_ENTRIES` (200) entries, about 300 KB. Even 100 teachers with 50 sets each is on the order of 1.5 GB at the absolute ceiling; realistic pilot use is a few MB. No partitioning, no external object storage and no index beyond §2.5 is needed.

**Derived data is stored, not recomputed per request.** `answer`, `answer_length`, `script` and `normalizer_version` are written once at import. Reads for the generator are an indexed range scan on `(set_id, position)` (partial index on live rows). A change of normalisation rules is a versioned re-derive script, not a runtime recomputation.

**Identity and stability.** `content_entries.id` and `content_sets.id` are immutable UUIDs and the only stable references future features may hold. Entry text can be edited (§6) and entries archived, but an id is never reused for another word. An entry removed by the end-of-pilot deletion invalidates references, which is why generated artifacts must copy what they need (§7).

**Backups and region.** Same as every other table: region and backup retention are recorded in `12` §0 and §2. Purging content does not remove it from backups until they age out (`12` §3.5).

## 6. Teacher management workflow

A teacher's life with content, from first upload to cleanup. Routes are under `/teacher/content` and use `requireTeacherAreaPage()` like the other teacher pages; every action uses `requireTeacherArea()` and the scoping of §2.7.

### 6.1 Screens

| Screen | Route | What the teacher does |
|---|---|---|
| Set list | `/teacher/content` | sees own sets and those linked to classrooms they co-teach: title, entry count, shortest/longest answer, classroom, last updated. Filters: 내 세트 / 학급 세트 / 보관됨. Button: 새 세트 (CSV) |
| New set from CSV | `/teacher/content/import` | §3 flow in `create` mode |
| Set detail | `/teacher/content/[setId]` | table of live entries (term, answer, length, definition); counts; import history (date, mode, accepted/skipped/archived), read with the service role from `content_import_batches` |
| Add or replace from CSV | `/teacher/content/[setId]/import` | §3 flow in `append` / `replace` mode |
| Edit set | in the detail page | rename; link or unlink a classroom; archive / restore |
| Edit entry | in the detail page | change term or definition of one entry (re-normalised by the same function, same duplicate rule); archive one entry |
| Download | button on the detail page | the live entries as CSV in the same `term,definition` format, so a downloaded set can be re-uploaded; every cell through `escapeCsvCell` |

### 6.2 Typical paths

1. **First set.** 새 세트 → name it, optionally pick a classroom → choose file → preview (accepted / warnings / rejected) → fix the file and re-select if there are errors, or accept the left-out rows → 저장 → land on the set detail.
2. **Add words later.** Detail → 파일로 추가 → preview shows which words already exist (skipped) → 저장.
3. **Start over.** Detail → 파일로 교체 → preview states "기존 단어 {k}개를 보관 처리하고 {m}개로 바꿉니다." → tick the confirmation → 저장. The old words stay archived and recoverable by Ops.
4. **Fix a typo.** Detail → edit the entry inline → saved; no file needed.
5. **Share with a co-teacher.** Link the set to the classroom both teach (§2.7); the co-teacher sees it under 학급 세트.
6. **Finish with a set.** Archive; it disappears from lists and from the generator view; restore any time.
7. **End of pilot.** Download the sets worth keeping before the deletion run (`12` §3.4).

### 6.3 Who can do what

| Action | Owner | Co-teacher of the linked classroom | Other teacher | Student |
|---|---|---|---|---|
| view set and entries | yes | yes | no | no |
| import `create` | yes (own new set) | n/a | n/a | no |
| import `append` | yes | yes | no | no |
| import `replace`, rename, link/unlink, archive/restore | yes | yes | no | no |
| edit or archive one entry | yes | yes | no | no |
| download | yes | yes | no | no |
| purge archived data | not offered (D5: archive only) | | | |

Admins act through the service role in server actions, as in M1. A suspended teacher cannot reach any of this (`requireTeacherArea` is the same guard the classroom pages use); their sets stay intact and remain visible to co-teachers of linked classrooms.

### 6.4 Server actions added for this workflow

In `src/features/content/sets/actions.ts` (`"use server"`, state objects, same error pattern as §3.1): `renameContentSetAction`, `linkContentSetClassroomAction` (also unlink), `archiveContentSetAction`, `unarchiveContentSetAction`, `updateContentEntryAction`, `archiveContentEntryAction`. The download is a route handler `GET /teacher/content/[setId]/export`, not a server action, because a browser download needs a real response with headers (see `02-implementation-plan.md` §7). Each re-checks `school_id`, ownership and archived state in the service, writes through the service role, and audits. Entry edits reuse the §4 normaliser, so a hand-edited entry cannot break the grid-safe rules; the database `CHECK`s and the unique index stand behind it.

Audit additions beyond §2.10 (also in migration 17): `content_entry.updated` (`{ setId, fields }`, no text), `content_entry.archived` (`{ setId }`) and `content_set.exported` (`{ entryCount }`); all with resource `content_set` and `resource_id` = set id.

### 6.5 Teacher-facing guardrails

- Import and edit pages carry the line "학생 이름, 학번 등 개인정보는 넣지 마세요." (D9).
- Replace and archive state what happens and that Ops can still recover it; the UI never says "삭제" for these.
- Counts shown after a save come from the database result, not from the preview, so a concurrent change is visible rather than hidden.

## 7. Future consumers (question generation, crosswords, learning games)

Nothing here is built in M2-1; this is what the stored data must offer so these features need no change to the M2-1 tables.

| Consumer | What it reads | What M2-1 already guarantees |
|---|---|---|
| Crossword generator | `v_content_entries_active` for one set: `answer`, `answer_length`, `term`, `definition` as the clue | grid-safe, unique, length-bounded answers; stable order; clue is non-empty plain text |
| Question generation (multiple choice, short answer, matching) | the same rows; distractors drawn from other entries of the same set | one term ↔ one definition per entry; unique answers per set; `script` lets a generator avoid mixing Korean and English options |
| Learning games (flashcards, matching, timed recall) | the same rows | stable `entry_id` for per-student progress; entry count and length range from `v_content_sets_summary` to decide whether a set is playable |
| AI generation (later) | writes entries into a set through the same commit path (a new `mode` or a `source` column) | the batch record, normaliser and unique index apply to any producer; `import_batch_id` says where an entry came from |

Rules those later designs must respect:
1. **Copy, do not point.** A generated crossword, quiz or round stores its own copy of the answer and clue text it used (plus `entry_id` for traceability). Otherwise editing or purging an entry changes or breaks a puzzle a student is solving.
2. **Answers never travel to a student's browser before play.** M2-1 gives students no read access to content; the player must be served with clues only (D11).
3. **Per-student results are student data.** Any table linking a student to a set or entry (scores, attempts) falls under `12` §0.1 and §3 erasure and needs its own cascade from `students`. M2-1 stores no such link.
4. **Minimum playable size** differs per consumer; each checks it against the summary view. M2-1 enforces no minimum set size.
5. **Optional later columns** (topic tag, difficulty, hint, image reference) are additive `ALTER TABLE` changes; the CSV stays `term,definition` and extra columns are already ignored with a notice (§4.5), so old files keep working.

## 8. Test plan

Location and style follow `tests/access/` (vitest, no database, guards and the service mocked as in `batch-cap.test.ts`) and `supabase/tests/` (pgTAP). Boundaries are written with the constants, never with literals, so changing a constant moves the boundary (the `MAX_BATCH_ROWS` pattern); one test pins each current value, as `batch-cap.test.ts` pins 30.

**`tests/access/content-cap.test.ts`** (the R2 equivalent)
- constants pin: `MAX_CONTENT_ROWS`, `MAX_CONTENT_CSV_BYTES`, `MAX_SET_ENTRIES` equal the agreed values; `ANSWER_MIN_LEN >= 1`, `ANSWER_MAX_LEN <= 30` (database bound).
- parser: exactly `MAX_CONTENT_ROWS` rows pass; +1 → `TOO_MANY_ROWS`, message contains the count and `최대 ${MAX}개`.
- bytes: a file of exactly `MAX_CONTENT_CSV_BYTES` bytes passes the size check; `+1` → `FILE_TOO_LARGE`; a multibyte (Korean) file is measured in bytes not characters.
- `file.size` is checked before reading (a `File` stub whose `arrayBuffer` throws is never read).
- zod run schema accepts cap, rejects cap + 1.
- actions: preview of cap rows creates a batch; cap + 1 refused, `createContentImportPreview` not called; commit of cap + 1 refused with a valid token, `commit` not called.
- set cap: preview `append` with `live + new > MAX_SET_ENTRIES` → `SET_TOO_LARGE`, no batch.

**`tests/access/content-csv-parse.test.ts`**
- BOM removed; CRLF/LF/CR; quoted comma; escaped quote; embedded line break in quotes; unclosed quote → `CSV_MALFORMED`.
- header: aliases, any order, case/space-insensitive, extra column notice, missing column → `MISSING_HEADER`, repeated → `DUPLICATE_HEADER`, header only → `NO_DATA_ROWS`, semicolon/tab header → `DELIMITER_UNSUPPORTED`.
- row numbers count blank records (a blank row 3 makes the next data row 4).

**`tests/access/content-encoding.test.ts`**
- UTF-8 with and without BOM decode; a CP949 byte sequence for "사과" (`BB E7 B0 FA`) → `ENCODING_INVALID`; UTF-16LE/BE BOM → `ENCODING_UTF16`; ASCII-only file passes; literal `U+FFFD` → `ENCODING_INVALID`.

**`tests/access/content-normalize.test.ts`**
- NFC: decomposed "사과" equals composed; answer identical.
- table-driven §1.3 examples including `ice cream`, `e-mail`, `O'Neil`, fullwidth `ＡＢＣ`, `3.14`, `사과(과일)`, `ㄱㄴㄷ`, `①`, `㈜`.
- boundaries with the constants: answer length 0 (only separators: error), `ANSWER_MIN_LEN` (ok), `ANSWER_MAX_LEN` (ok), `+1` (error); term `TERM_MAX_CHARS` / `+1`; definition `DEFINITION_MAX_CHARS` / `+1`.
- NUL and bidi characters are removed and never survive to the output; `U+0000` in input does not throw.
- warnings: `DEFINITION_CONTAINS_ANSWER`, `FORMULA_PREFIX`, `ANSWER_MIXED_SCRIPT`, `WHITESPACE_NORMALISED`.
- idempotence: `normalize(normalize(x))` equals `normalize(x)`.

**`tests/access/content-preview.test.ts`**
- duplicate in file: first wins, message names the first row; same-definition vs conflicting-definition codes; case/space/NFC variants collide.
- `append`: `DUP_EXISTING` against a stubbed existing set; `replace` and `create` do not report it.
- partial file: valid rows still returned with the invalid ones listed; zero valid → no token.
- every message equals the §4.8 text (snapshot of the code → message map).

**`tests/access/content-actions-authorization.test.ts`** (as `actions-authorization.test.ts`)
- student, anonymous and suspended teacher get an error state and nothing is stored.
- teacher B cannot preview/commit into teacher A's set; a classroom from another school is refused; archived set refused; `replace` without `confirmReplace` refused.

**`tests/access/content-token.test.ts`** (as the M1 token tests)
- same `rows_hash` input gives same hash; changing mode, set, title, classroom, a term or the normaliser version changes it.
- token from a `create` preview cannot commit an `append`; a token from a `cap`-row preview cannot commit a different row set.

**pgTAP `supabase/tests/00009_content_sets.test.sql`**
- RLS enabled on `content_sets`, `content_entries`, `content_import_batches`; no write policy; `anon` and `authenticated` cannot insert/update/delete; students see nothing.
- owner sees own set and entries; other teacher does not; co-teacher of the linked classroom does; after `classroom_teachers` removal, no longer.
- `chk_content_entries_answer_grid_safe` rejects `사과!`, lowercase `abc`, space, empty; `answer_length` generated correctly for Hangul and Latin; unique partial index rejects a second live `사과` but allows it after archiving the first.
- deleting the owner's `auth.users` row cascades to sets, entries, batches; deleting a classroom sets `classroom_id` null and keeps the set.
- `uq_content_sets_owner_title_active`: case/space-insensitive duplicate title rejected; allowed after archive.
- views: `v_content_entries_active` hides archived entries and archived sets; `security_invoker` honours RLS.

**pgTAP `supabase/tests/00010_content_import.test.sql`**
- `fn_commit_content_import` is executable by `service_role` only.
- success path for each mode: counts, `position` continuity, audit row written with no terms in `metadata`.
- single use: second call with the same token fails and writes nothing; wrong token / wrong actor / wrong rows hash / expired → named exception, `status` unchanged (expired sets `expired`).
- atomicity: `replace` where the insert part violates the cap → nothing archived, nothing inserted, batch still `previewed`.
- concurrency by sequence: after preview, insert the same answer directly, then commit → counted as `skipped_rows`, no error.
- cross-school set or classroom → exception.

**Management workflow tests** (`tests/access/content-management.test.ts`, mocked service as in `actions-authorization.test.ts`): rename/archive/link allowed for the owner, allowed for a co-teacher of the linked classroom (D3) and refused for another teacher; entry edit re-runs the normaliser and refuses an answer outside the grid-safe set or a duplicate; export passes every cell through `escapeCsvCell` (a definition `=1+1` comes out as `'=1+1`) and re-parses to the same rows; audit metadata never contains term or definition text (assert on the written payload).

**Existing suites stay green:** `pnpm test:access`, `supabase test db`, `pnpm typecheck`, `pnpm lint`. The audit enum parity (TypeScript union vs migration) is checked wherever M1 checks it, extended for the six new actions. Hosted tests are not part of this plan.

---

## 9. Assumptions

| # | Assumption |
|---|---|
| A1 | Pilot context of `12`: single school, teacher-created content only, ≤ one school's teachers; no students touch content in M2-1 |
| A2 | The crossword generator reads from the database through `v_content_entries_active` (or the same query), one set at a time |
| A3 | Content is plain text: no images, no markup, no per-entry hints beyond the `definition` |
| A4 | One Hangul syllable = one grid cell. Latin letters = one cell each. Spaces and hyphens are not cells |
| A5 | Words are unique per set by `answer`; the generator never needs two entries with the same answer |
| A6 | `classroom_id` link is optional; students are not given the sets directly in M2-1 |
| A7 | M1 files stay untouched until the M1 release closes. The shared CSV module move (§3.7) is a follow-up refactor |
| A8 | `supabase/` migrations are applied in filename order and the new date prefix sorts after `20261016000003` |
| A9 | Next.js server-action body limit is the 1 MB default (no `bodySizeLimit` set in the config at the time of writing) |
| A10 | Not verified: nothing here was run; no migration was applied to any database, and no hosted or local Supabase was used |

## 10. Open decisions for the PM

| # | Decision | Recommendation / status |
|---|---|---|
| D1 | Limits: rows per file `100`, bytes `128 KB`, words per set `200`. Or reuse `30` for symmetry with M1? | 100 / 128 KB / 200: M1's 30 comes from account-creation time, which does not apply here |
| D2 | ~~Answer length bounds~~ **Decided by the PM: one-character entries are allowed** (`ANSWER_MIN_LEN = 1`; max stays 15; digits allowed; mixed Hangul+Latin allowed with a warning). Only an answer that is empty after removing separators is `ANSWER_TOO_SHORT` | Decided |
| D3 | ~~Who may write to a set linked to a classroom?~~ **Decided by the PM: co-teachers manage content** (append, replace, rename, link, archive, edit entries), same as the owner | Decided |
| D4 | Wrong encoding (CP949 from Excel): reject with instructions, or auto-convert? | Reject for the pilot (no silent guessing); revisit if teachers hit it often |
| D5 | ~~Retention of archived entries~~ **Decided by the PM: archive only.** Nothing is purged during the pilot; archived rows go with the owning teacher at the end-of-pilot deletion | Decided |
| D6 | Duplicate with a different definition when appending: skip (default) or offer "update definition" mode? | Skip now; the update mode is a later addition |
| D7 | ~~Include "download set as CSV" in M2-1?~~ **Resolved by D14: included** | Decided |
| D8 | Include "undo last import" (restore archived entries / archive appended ones) in M2-1? | No; data model supports it (`import_batch_id`, `archived_batch_id`), build when asked |
| D9 | Governance text: add content to `12` §0.1 and §1 (free text must not contain student personal data) before signing, or in the next revision? | Add before signing if D6 is not yet signed; otherwise next revision. Needs the school's data-protection contact |
| D10 | Move the CSV tokenizer to `src/lib/csv/` (shared, fixes M1 row-number drift after blank rows) after M1 release? | Yes, after the M1 release closes, as its own change with M1 tests unchanged |
| D11 | Should students ever receive `definition` without `answer` through a safe view in M2-2? (affects whether an `answer` column may be selected by `authenticated`) | Decide with the crossword-player design; M2-1 gives students no access |
| D12 | ~~Header line required?~~ **Decided by the PM: header required.** Files without a `term,definition` header (or alias) are refused with `MISSING_HEADER`. A downloadable sample file is offered on the import page | Decided |
| D13 | ~~Keep the original uploaded CSV?~~ **Decided by the PM: do not retain the original CSV.** Only `source_sha256` / `source_bytes` are stored (§5). Revisit only if the school asks, with a retention line added to `12` | Decided |
| D14 | ~~Single-entry edit and CSV download in M2-1?~~ **Decided by the PM: both are included** (§6: `updateContentEntryAction`, `archiveContentEntryAction`, `exportContentSetAction`) | Decided |

| D15 | ~~Owner deletion~~ **Decided by the PM (P1): ownership must be transferred first.** `content_sets.owner_id` is `ON DELETE RESTRICT`; a teacher who owns sets cannot be deleted until Ops transfers or deletes them (`12` §3.4, §4.3) | Decided |
| D16 | ~~Archived classroom~~ **Decided by the PM (P2): read-only.** Sets linked to an archived classroom can be read but not imported into, replaced, renamed or edited by anyone, owner included (`CONTENT_CLASSROOM_ARCHIVED`) | Decided |
| D17 | ~~Numeric-like terms~~ **Decided by the PM (P3): rejected** (`ANSWER_NUMERIC_LIKE`: `1.5`, `3.14`, `1,000`, `-5`, `2024-10-17`, phone numbers). Plain digits (`2024`) and digits with letters (`3D`, `COVID-19`) stay valid | Decided |
| D18 | ~~Governance text~~ **Decided by the PM (P4): `docs/pilot/12` is updated before the M2 merge** (content rows in §0.1, §1, §2, §3.4, §4.3, §5) | Decided |