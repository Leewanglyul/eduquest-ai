# M2-3. Competition framework (future planning)

Status: **planning note only. Nothing in this document is scheduled, decided or implemented.** It preserves the original EduQuest idea of a *classroom game platform* (not only a content system) so that it is not lost while M2-2 stays focused on the crossword. It does not change the scope of M2-1 or M2-2, and no migration, screen or constant follows from it. Owner: engineering, for a later PM decision.

Relation to other documents: [04-crossword-generator.md](04-crossword-generator.md) (the crossword, whose M2-2.4 play phase creates the data used here) · [05-m2-2-2-teacher-review-plan.md](05-m2-2-2-teacher-review-plan.md) (the current phase) · `docs/pilot/12` and `13` (data governance, D6).

## 0. Where the current design stands

Competition is not designed anywhere in M2-2. What exists is deliberate deferral plus some raw material.

| Item | State |
|---|---|
| Rankings and leaderboards | **Deferred by decision.** Doc 04 §5.4 "No rankings or leaderboards in the pilot"; §4.2 "no ranking by default"; decision C6 "results visible to the student and the classroom's teachers only; no rankings or leaderboards (privacy and classroom climate); revisit only on request" |
| Cross-school ranking | Out of scope (doc 04, scope line at the top) |
| Team, classroom-vs-classroom, seasonal, cooperative play | Not mentioned in doc 04 or 05 |
| Raw material | One attempt per student and assignment with `completed_at`, `active_seconds`, `checks_used`, `reveals_used`, `cells` (doc 04 §6.2, table created in M2-2.4, not in M2-2.2); an assignment per puzzle and classroom with `opens_at` / `closes_at`; one puzzle for several classrooms with separate attempts (C9) |
| Constraints that shape any competition | Per-student results are student data and must cascade from `students` (doc 04 §0 rule 3); teachers see only their own classrooms (§5.5); difficulty presets change hints and checks (§3.1), so raw times are not comparable across presets; no free-text profiles (`docs/pilot/12` §1) |

**Principle for everything below:** competition is opt-in per event, chosen by a teacher, visible only to the people the teacher chose, and never required to play. The existing "my own progress" experience stays the default.

## 1. Individual competition

**Idea.** Students compare their own result with classmates on the same puzzle, or with their own earlier results (personal best).

**Forms, from mildest to strongest**

| Form | Shows | Privacy |
|---|---|---|
| Personal best | the student's own previous results | no data about others |
| Milestones | "completed", "no hints used", "first try" markers for the student | none about others |
| Class standings | rank or score within one classroom | other students' results become visible |

**Scoring needs its own design.** Completion time alone is unfair (reading speed, typing speed, hint presets). A score is built from: completed or not · correct cells · hints and reveals used · active time · difficulty preset multiplier. The rule is a constant set pinned by tests, shown to students in plain Korean, and versioned (`score_version`) so old results are not reinterpreted.

**Fairness rules:** compare only attempts of the same puzzle version and preset; the first completed attempt counts (one attempt per student, C5), so retries cannot be farmed; a teacher "reset my attempt" (C5 follow-up) never counts as a new try for standings.

## 2. Team competition

**Idea.** Students form or are placed in teams inside a classroom; the team's result is an aggregate of its members' individual attempts.

- **Team formation:** teacher-assigned (random or by the teacher) in the first version. Self-formed teams add moderation risk and are a later option.
- **Team name and avatar:** from a fixed list (colours, animals) or numbered ("1모둠"). No free text (`docs/pilot/12` §1).
- **Aggregation:** sum, average or "best N of M" of member scores; the rule is part of the event and shown to students. Average avoids punishing small teams.
- **Individual attempts stay individual.** A team result is computed from them; there is no shared grid in this form (shared play is section 8).
- **Fair size:** teams of the same size per event, or averages.
- **Absence:** a member who did not play counts as zero or is excluded by the stated rule, never silently.

## 3. Classroom competition

**Idea.** Classrooms (of the same teacher or the same school) compete on the same puzzle in the same period.

- **Scope in the pilot school:** classrooms of one school only. Cross-school stays out of scope (doc 04) and needs its own governance review.
- **Aggregation:** class average and completion rate, so large and small classes are comparable. Raw totals are never used.
- **Who sees what:** a teacher sees their own classrooms' students; a class-vs-class view shows **aggregates per classroom only**, never another classroom's student names. This keeps doc 04 §5.5 (teachers do not see other classrooms' students) intact.
- **Consent:** the teachers of every participating classroom must opt in to an event.
- **Same puzzle, same version, same window:** guaranteed by one event pointing at one published puzzle version with one assignment per classroom (C9 already allows this).

## 4. Leaderboards

**Idea.** A ranked view of individuals, teams or classrooms.

Leaderboards are a *display* of the results in sections 1–3, not new data. Options the PM must choose among:

| Option | Meaning |
|---|---|
| Teacher only | the teacher sees standings, students see only their own result (today's behaviour plus scores) |
| Anonymous rank | a student sees their own rank and the top N as "1st, 2nd…" without names |
| Pseudonymous | rank with fixed-list nicknames (not real names) |
| Named | rank with real names; the strongest exposure, not recommended for a school |

Rules for any leaderboard: shows at most the top N and the student's own position, never "last place" lists; ties share a rank; a student can opt out of appearing (shown as "hidden"); a teacher can switch it off per event; the board is computed from final results of closed assignments or refreshed on a schedule, not live, to avoid pressure while playing; nothing is shown outside the classroom (or the participating classrooms of one event).

## 5. Seasonal and recurring events

**Idea.** Time-boxed or repeating challenges: weekly puzzle, a unit-test week, a term-long season with a final standing.

- **Event** = name, period, puzzle or puzzle set, scoring rule version, participating classrooms, visibility mode (section 4), status (`draft`, `scheduled`, `running`, `closed`, `archived`).
- **Recurring** = a template plus a schedule (for example every Monday for 8 weeks) that creates one event per period; each event is independent and closes on its own.
- **Season** = a group of events with a cumulative standing (best N events, or sum). A season has a start and an end; closing it freezes the standings.
- **Reset:** standings are per event/season; nothing carries over unless the season says so. Past seasons stay readable to the classroom as history (retention below).
- **Puzzle supply:** each event uses a published, immutable puzzle version (M2-2 rules); a recurring event needs one published puzzle per period, so teachers need either a reuse mode (same puzzle again) or a puzzle queue. Automatic puzzle generation per period is out of scope here.
- **Rewards:** badges and titles are cosmetic and non-comparable by default ("participated in 4 weeks"); no points that unlock anything outside the game.

## 6. Privacy and governance impact

Student-visible comparison is the single biggest change of data exposure in the platform: until now a student's performance is visible only to that student and their teachers. A competition feature therefore **must not go live before** the following are decided and signed:

1. **Update of `docs/pilot/12` and `13` (D6).** New data categories: scores, ranks, team membership, event participation. New purpose: classroom comparison. New disclosure: results visible to classmates (named, pseudonymous or anonymous). Needs the data-protection contact's agreement, like crossword attempts (doc 04 C13).
2. **Decision C6 reversed or narrowed by the PM**, in writing, naming the visibility mode that is allowed.
3. **Opt-in at classroom level, opt-out at student level**, with the wording a guardian can understand. Whether guardian notice is required is a question for the school contact, not assumed here.
4. **Data minimisation:** standings store ids, scores and ranks, not names; names are joined at display time under the visibility mode. Team names come from fixed lists.
5. **Retention and erasure:** every competition table that references a student cascades from `students` (so the existing erasure procedure keeps working); team and standing rows lose the member on erasure and the aggregate is recomputed or marked "recomputed"; the 30-day post-pilot retention applies to competition data as to attempts.
6. **Audit:** event creation, rule version, visibility changes and closing are audited (ids and counts, no student text), as in M2-1 and M2-2.
7. **Safety and climate:** no public "worst" lists; no direct messaging, comments or reactions on standings; teacher can hide or close an event at any time; anti-cheating limited to server-side checking, one attempt, and not exposing answers (already in doc 04 §5.3).
8. **Accessibility and fairness:** competition never blocks access to the content; students who prefer not to compete can play unranked; ranks never use colour alone.

## 7. Future schema impact

Sketch only, to show how the M2-2 design leaves room. **No table below is created by M2-2; names and columns are provisional.**

### 7.1 What M2-2 and M2-2.4 already provide (no change needed)

`crossword_puzzles` (versioned, immutable once published) · `crossword_assignments` (puzzle x classroom, window) · `crossword_attempts` (M2-2.4; student, time, hints, completion). A competition scores *attempts of assignments of a published puzzle version*.

### 7.2 Provisional new tables (M2-3)

| Table | Purpose |
|---|---|
| `competition_events` | one event: owner, school, name, period, `scoring_version`, visibility mode, status |
| `competition_event_puzzles` | event -> published puzzle version (and which assignment per classroom) |
| `competition_event_classrooms` | participating classrooms and their teachers' opt-in |
| `competition_teams` | team in an event/classroom: fixed-list name key, size |
| `competition_team_members` | team -> student (cascade from `students`) |
| `competition_scores` | one row per attempt per event: score, parts (JSON), `scoring_version` (cascade from the attempt/student) |
| `competition_standings` | frozen or refreshed ranks for individual / team / classroom, per event or season; ids and numbers only |
| `competition_seasons`, `competition_season_events` | season and its events |
| `competition_recurrences` | template and schedule for recurring events |
| `competition_student_prefs` | opt-out of appearing, per student (cascade) |

### 7.3 Rules the schema must follow

- Everything student-related cascades from `students`; the end-of-pilot deletion order of `docs/pilot/12` §3.4 gains these tables **before** teachers.
- Scores are derived and reproducible from attempts plus `scoring_version`; a rule change adds a version, never rewrites old scores.
- Standings are display data: they may be recomputed; they hold no names.
- RLS as for the crossword: teachers of the participating classrooms read; students have **no direct table access**; every student-facing read goes through server code that applies the visibility mode.
- Published puzzles stay immutable (M2-2); an event never edits a puzzle, it points at a version.
- Enum additions (event status, visibility mode, scoring kind) are added alone in a migration, as in M2-1 and M2-2.

### 7.4 Constraints this puts on M2-2.4 (precautions, not new scope)

1. Keep `completed_at`, `active_seconds`, `checks_used`, `reveals_used` on the attempt as designed.
2. Do not hard-code "no comparison" into the student queries: make visibility a server-side decision in one place.
3. Do not store derived rank in the attempt.
4. Keep one attempt per student and assignment; retries, if ever allowed, must be recorded so standings can ignore them.

## 8. Beyond M2-3: cooperative classroom play

Shared solving of one grid by a team or the whole class (live cursors, shared cells) is a different play model: it needs real-time shared state, conflict handling, group moderation and a different results model. It is **not part of M2-3**. If wanted, it is a separate later milestone that can reuse teams (section 2) and events (section 5). The multi-connection design of the earlier escape-room project is the nearest internal reference for the real-time part.

## 9. Proposed phases (for later)

| Phase | Delivers | Needs |
|---|---|---|
| M2-3.0 Decisions and governance | PM answers (section 10), update of `docs/pilot/12`/`13`, written reversal or narrowing of C6 | M2-2.4 live |
| M2-3.1 Scoring | pure scoring functions, versioned constants, tests | M2-2.4 data |
| M2-3.2 Individual standings | schema, per-event score, personal best, teacher view, chosen visibility mode | 3.0, 3.1 |
| M2-3.3 Teams | team tables, assignment by teacher, team aggregation | 3.2 |
| M2-3.4 Classroom competition | multi-classroom events, aggregates only | 3.3 |
| M2-3.5 Seasons and recurrence | events grouped in seasons, schedules, reuse mode | 3.4 |
| M2-3.6 Hardening | privacy review, accessibility, load, browser checks | all |

## 10. Open questions for the PM (none answered)

| # | Question |
|---|---|
| K1 | Is student-visible comparison wanted at all in the school? If yes, which visibility mode (teacher only, anonymous rank, pseudonymous, named)? |
| K2 | Should C6 be reversed, or replaced by an opt-in rule per event? |
| K3 | Are teams assigned by the teacher only, or may students form them? |
| K4 | Class-vs-class: only inside one teacher's classrooms, or across the school? |
| K5 | Is a student allowed to opt out of appearing in standings, and who can decide for them? |
| K6 | Do badges and titles exist, and are they cosmetic only? |
| K7 | Seasonal events: manual (a teacher starts each) or scheduled recurrence? |
| K8 | Who must approve the governance change, and is guardian notice required? |
| K9 | Is cooperative real-time play wanted, and when? |
