# M2-3. Competition framework (future planning)

Status: **planning note only. Nothing in this document is scheduled or implemented.** Sections 0–10 were written first; the **PM addendum in section 11 (CC-1…CC-10, recorded 2026-10-17, approved by the PM with the clarifications of section 11.7) and the PM addendum 2 in section 12 (CE-1…CE-12, approved decisions, with the clarifications of section 12.9) record PM direction and take precedence over them where they differ.** Section 11.2 lists exactly what addendum 1 changes; section 12.3–12.5 compare addendum 2 with addendum 1. It preserves the original EduQuest idea of a *classroom game platform* (not only a content system) so that it is not lost while M2-2 stays focused on the crossword. It does not change the scope of M2-1 or M2-2, and no migration, screen or constant follows from it. Owner: engineering, for a later PM decision.

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

> **Superseded in part by CC-4 (section 11).** The PM wants a collaborative crossword mode inside M2-3 (as M2-3.4). The analysis below (real-time shared state, moderation) still describes the work involved.

Shared solving of one grid by a team or the whole class (live cursors, shared cells) is a different play model: it needs real-time shared state, conflict handling, group moderation and a different results model. It is **not part of M2-3**. If wanted, it is a separate later milestone that can reuse teams (section 2) and events (section 5). The multi-connection design of the earlier escape-room project is the nearest internal reference for the real-time part.

## 9. Proposed phases (for later)

> **Replaced by the order in CC-10 (section 11.3).** Kept for history and for the dependency reasoning.

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

---

## 11. PM addendum: competition and collaboration principles

Recorded as PM direction on 2026-10-17. This is **direction, not an implementation commitment**: nothing here changes the scope of M2-2, and every item still passes through the M2-3.0 decision and governance gate (section 11.5).

### 11.1 Background and principle

EduQuest is meant to be more than a content delivery system. The long-term objective is:

```
Learning + Game mechanics + Classroom collaboration + Healthy competition
```

Competition should raise engagement without creating excessive pressure or discouraging students with lower achievement. The PM priority order is

```
Collaboration -> Engagement -> Competition
```

and **not** `Competition -> Ranking -> Elimination`. The system should motivate every student, including those with lower academic achievement, to take part meaningfully.

### 11.2 What this changes in sections 0–10

| Earlier text | Now |
|---|---|
| §1 individual competition and §4 leaderboards come first | Individual ranking is **late** (nickname leaderboards, M2-3.5). The primary classroom interface is the **team progress board** (CC-5) and **class goals** (CC-9) |
| §2 teams: "teacher-assigned in the first version" | Confirmed (CC-1); teams also get identity (CC-3) |
| §4 visibility option "named" | Students normally see **nicknames only**; teachers see real name and student number (CC-6). "Named" boards for students are not planned |
| §8 cooperative play is beyond M2-3 | Collaborative crossword is **in M2-3** as M2-3.4 (CC-4) |
| §9 phase list (scoring first, then individual standings) | Replaced by the CC-10 order (11.3); badges and class goals come first and need no student-to-student comparison |
| §10 K1 (is comparison wanted?) | Partly answered: team and class progress yes; ranked comparison of individuals only as nickname boards, late |
| §10 K3 teams | Answered: teacher-assigned (CC-1) |
| §10 K6 badges | Answered: badges exist, first deliverable (CC-10, M2-3.1); cosmetic only unless the PM says otherwise |
| §10 K9 cooperative play | Answered: yes, M2-3.4 (CC-4) |
| §5 seasonal events | Last in the order (M2-3.8) |

### 11.3 The decisions

**CC-1 Team-based progress competition (High).** Students take part in crossword events as members of a **teacher-assigned team** (Blue, Green, Yellow, Red…). Public progress indicators show a team's completion, for example `Blue Team 82% / Green Team 74% / Yellow Team 65% / Red Team 49%`. Aim: collaboration inside a team, competition between teams.

**CC-2 Team contribution visibility (High).** The system supports contribution tracking per member, for example `A 35% / B 28% / C 22% / D 15%`, measured from correct entries, completed words, solved cells and participation actions. **Visible to teachers.** Whether students may see it is a future PM decision.

**CC-3 Team identity (High).** A team has a **colour, an icon and a name** (Blue Team, Green Team, Red Team…). Puzzle cells may optionally show team-related visual indicators.

**CC-4 Collaborative crossword mode (High, future mode).** Several students solve the **same crossword at the same time**: shared puzzle state, team progress, contribution tracking. This is **not** real-time PvP. Cooperation first, competition second.

**CC-5 Team progress board (High).** Preferred over traditional leaderboards and the **primary classroom competition interface**. Shows team completion %, words solved, remaining words and completion status.

**CC-6 Nickname-based visibility (High).** Teachers may see real name and student number. Students normally see **nicknames only** (for example SilverFox, BlueTiger, ScienceHero). This reduces privacy concerns while keeping engagement.

**CC-7 Competition design principle (High).** Competition promotes learning rather than punishing mistakes. Preferred mechanics: hints, team boosts, achievement rewards, cooperative milestones. Over: strong attack mechanics and direct learning disruption.

**CC-8 Optional classroom game effects (Medium, exploratory).** Teacher-controlled effects may be explored later (temporary visibility reduction, visual distraction effects, team abilities). Learning disruption must stay minimal, teachers must be able to disable them, and support-oriented abilities are preferred over attack-oriented ones.

**CC-9 Class goals (Very high).** Goals such as "the class reaches 80% completion", "the class solves 500 words this month", "all teams finish a puzzle". **Class goals are preferred over individual rankings.**

**CC-10 M2-3 roadmap adjustment.** Recommended order:

| Phase | Delivers |
|---|---|
| M2-3.1 | Badge system |
| M2-3.2 | Class goals |
| M2-3.3 | Team progress board |
| M2-3.4 | Collaborative crossword |
| M2-3.5 | Nickname leaderboards |
| M2-3.6 | Team competition |
| M2-3.7 | Classroom competition |
| M2-3.8 | Seasonal events |

### 11.4 Design notes and tensions to resolve (engineering input, not PM decisions)

These are the points where the addendum meets constraints already in the design. Each needs an answer before its phase starts.

1. **Nicknames and "no free-text profiles".** `docs/pilot/12` §1 keeps free text out of student profiles. Nicknames therefore come from **fixed word lists** (adjective + animal or role, for example SilverFox), generated or picked from a list, unique inside a classroom, resettable by the teacher, never typed by the student. A nickname is still personal data tied to a student (pseudonymisation, not anonymisation): it must cascade from `students` and be covered by D6. Nicknames are needed from **the first view in which one student can see another**, which is the team board with members or the collaborative mode (M2-3.3 / M2-3.4). Recommendation: build the nickname foundation as part of M2-3.0 or at the start of M2-3.3, not at M2-3.5 where the roadmap lists nickname leaderboards.
2. **Team progress board and stigma (CC-1, CC-5).** Showing 49% beside 82% in public is exactly the pressure the PM wants to avoid for weaker teams. Options the PM can pick: show progress without an order (alphabetical or by colour), show each team's progress against **its own goal** or against the class goal, hide exact percentages below a threshold, or let the teacher choose per event. Whatever is chosen, a teacher can switch the board off (consistent with section 6).
3. **Team size and fairness (CC-1, CC-2).** Team completion % must be computed per team so that team size does not decide the winner (percentage of the team's own capacity, not totals). Contribution % between members says nothing about quality of effort: it is teacher-only for now (CC-2) and must never feed a student-visible grade.
4. **Collaborative crossword (CC-4) is a different attempt model.** The M2-2.4 design is one attempt per student and assignment (decision C5). A shared grid needs a **team attempt** (one shared state, many contributors) alongside the individual attempt, a conflict rule for two students typing in one cell, presence, and a transport for live updates (polling, or a real-time channel). The internal multi-connection design of the earlier escape-room project is the nearest reference for the transport. Precaution for M2-2.4: do not hard-code "attempt belongs to exactly one student" into the play API and server checks; keep the checking and payload builders independent of who owns the attempt. This does not change M2-2.
5. **Contribution measurement (CC-2).** "Participation actions" and "correct entries" need server-side events: a correct cell is attributed to the student who entered the final correct character; an overwrite is attributed to the new author. The rule is versioned like scoring. Measure what the server already verifies; do not log keystrokes.
6. **Game effects and accessibility (CC-8).** Visibility reduction and distraction effects can conflict with accessibility (low vision, photosensitivity, attention needs) and with the "no time pressure, WCAG AA" stance of doc 04 §5.2. Conditions if this is ever built: **off by default**, enabled per event by the teacher, never applied to a student who has opted out or who needs accommodations, no flashing or rapid motion, and a visible "effects on/off" indicator. CC-8 is Medium and is not in the CC-10 order; treat it as exploratory until the PM schedules it.
7. **Badges (CC-10 M2-3.1).** They are the safest first deliverable: they need only the individual attempt data of M2-2.4, show to the student alone, and compare nobody. They depend on M2-2.4 being live, not on M2-3.0 competition governance beyond a short D6 note for new data (earned badges).
8. **Class goals (CC-9).** Goals aggregate over attempts of a classroom and a period ("500 words this month"). They need a goal definition (metric, target, period, classroom), progress computed from attempts and a rule for words counted twice (a word counts once per student and puzzle).

### 11.5 Governance and gate (unchanged requirement, new data)

The M2-3.0 gate of section 9 still applies before anything student-visible beyond a student's own progress: update of `docs/pilot/12` and `13` (D6), a written narrowing of decision C6, and the data-protection contact's agreement. New data categories from this addendum: team membership, team colour/icon/name, contribution figures, nicknames, badges, class goals. Nothing is shown to students except (a) their own progress and badges, (b) team and class progress aggregates, (c) nicknames; real names and student numbers stay teacher-only (CC-6).

### 11.6 Revised phase sketch (replaces section 9 for planning)

| Phase | Delivers | Needs |
|---|---|---|
| M2-3.0 Gate | PM answers, governance update (D6), narrowing of C6, nickname rules (11.4 note 1) | M2-2.4 live |
| M2-3.1 Badge system | badge definitions, awards from attempt data, student sees own badges | 3.0, M2-2.4 data |
| M2-3.2 Class goals | goal definition, progress from attempts, teacher and student view of class progress | 3.1 |
| M2-3.3 Team progress board | team table with colour/icon/name, teacher assignment, contribution tracking (teacher view), progress board, nicknames visible | 3.2 |
| M2-3.4 Collaborative crossword | shared team attempt, live state, contribution tracking | 3.3, transport decision |
| M2-3.5 Nickname leaderboards | optional boards with nicknames only, teacher can disable | 3.3 |
| M2-3.6 Team competition | scored events between teams, support-style boosts | 3.4 or 3.3 |
| M2-3.7 Classroom competition | multi-classroom events, aggregates only | 3.6 |
| M2-3.8 Seasonal events | events, recurrence, seasons | 3.7 |
| (exploratory) CC-8 | game effects | accessibility review |

### 11.7 PM review: approval and clarifications

The PM approved this document. Clarifications recorded with the approval:

| # | Clarification | Effect |
|---|---|---|
| 1 | **Nicknames are generated only. No free-text nicknames.** | Settles the core of K12: a nickname is never typed by a student or a teacher. It is assembled from fixed word lists (11.4 note 1). Still open inside K12: assigned vs picked from a generated shortlist, and teacher reset |
| 2 | **Team progress boards prefer goal-oriented progress indicators over direct rank comparison.** | Leans K10 toward "no ranked order": show each team's progress toward a goal (its own or the class goal), not a league table. Exact form still open (K10) |
| 3 | **Keep the M2-2.4 attempt model flexible enough for future shared-team attempts.** | Becomes a design requirement for M2-2.4 (11.8). It does not change M2-2.2 or add M2-2.4 scope |
| 4 | **CC-8 remains exploratory. Defaults: disabled, teacher-controlled.** | Confirms 11.4 note 6. No phase is scheduled |
| 5 | **K10–K16 stay open and may be deferred until M2-3 implementation planning.** | They gate M2-3 phases, not M2-2 |

### 11.8 Requirement carried into M2-2.4 (no scope change)

When the M2-2.4 attempt model is designed, keep it open for a later shared-team attempt without redesign:

- The play payload builder and the server-side checking (check cell/word/puzzle, reveal, submit) take **an attempt and its puzzle**, not "a student's browser session". They must not assume the attempt has exactly one author.
- The attempt record keeps **who acted** separate from **whose attempt it is** where it is cheap to do so (for example a nullable actor on recorded events, even if M2-2.4 only ever writes the owning student). Per-cell attribution is not built in M2-2.4.
- Counters (checks, reveals, active time) belong to the attempt, so a later team attempt can own them.
- Student identity never appears inside `cells`; the cell state stays a plain `{ "r,c": character }` map.
- Completion and progress are computed from `cells` and the puzzle, not from the owner, so the same function can score a team attempt.
- Nothing in M2-2.4 implements teams, sharing or live updates. This is only a constraint on shape.

### 11.9 Open questions for the PM

| # | Question |
|---|---|
| K10 | Team board form: goal-oriented indicators are preferred (11.7 #2). Which exact form: progress against each team's own goal, against the class goal, or both? Is any ordering shown at all? |
| K11 | May students ever see contribution figures (CC-2), and if so only their own? |
| K12 | Nicknames are generated only (11.7 #1). Still open: assigned automatically or picked from a generated shortlist; can a teacher reset one; can a student ask for another generated one? |
| K13 | Are badges purely cosmetic, or may they unlock anything (for example a team boost)? |
| K14 | Which team boosts are acceptable (hints, extra reveals)? Must a boost never reduce another team's chances? |
| K15 | Is the collaborative crossword limited to one team per grid, or may the whole class share one grid? |
| K16 | CC-8 effects stay exploratory, disabled by default and teacher-controlled (11.7 #4). Open: whether they are ever scheduled |

All of K10–K16 may be deferred until M2-3 implementation planning (11.7 #5). **Addendum 2 (section 12.7) changes the status of several of them and adds K17–K25.**

---

## 12. PM addendum 2: classroom collaboration and engagement principles

Recorded 2026-10-17. **These are approved PM decisions, not proposals.** They extend the addendum of section 11 (CC-1…CC-10). They do not change the scope of M2-2: nothing here is built before M2-3, and every student-visible item still passes the M2-3.0 gate (section 11.5). Sections 12.3–12.7 (comparison, conflicts, governance questions, K-question updates) are **engineering analysis of the approved text**, not new PM decisions; where they interpret, they say so and ask the PM to confirm.

### 12.1 The decisions

**CE-1 Help request system (Very high).** Students or teams may request assistance (for example a button "🙋 도움이 필요해요"). The teacher dashboard shows the team, the current puzzle, the time stuck and the status of the help request. Purpose: early intervention, less frustration, better participation.

**CE-2 Teacher awareness dashboard (Very high).** Teachers can see the current puzzle, team progress, blocked teams, hint usage and help requests. **Teacher visibility takes priority over leaderboard visibility.** It supports formative assessment.

**CE-3 Puzzle focus tracking (High).** Track the current word, the current clue and the current puzzle area, for example "Blue Team is currently working on 삼권분립". Purpose: support teacher coaching, avoid duplicated effort, improve team coordination.

**CE-4 Shared attempt architecture (Very high).** Future collaborative modes need **one attempt with multiple contributors**, not one attempt owned by one student. **Do not hard-code single-owner assumptions.**

**CE-5 Team resource model (High).** Resources are **team-owned**: 초성 hints, word reveals, help cards, extra clues. Purpose: discussion, collaboration, collective decisions.

**CE-6 Collaborative puzzle mode (Very high).** Shared crossword, shared progress, shared completion. Features: contribution tracking, shared cells, team completion. Primary goal cooperation; secondary goal competition.

**CE-7 Team identity system (High).** Teams may have a colour, a name and a badge. Purpose: engagement, belonging, recognition.

**CE-8 Contribution tracking (High).** Teachers may review solved words, solved cells, puzzle actions and support actions. **Informational only.** The system must explain that verbal collaboration cannot be fully measured.

**CE-9 Progress boards over rankings (Very high).** Preferred: team progress, goal completion, milestones. Over: individual ranking and public score ordering. Example: "Blue Team 82% complete — Next goal: 90%".

**CE-10 Classroom goals (Very high).** Examples: the class reaches 80% completion; all teams complete the puzzle; the class solves 500 cells.

**CE-11 Competition safety principle (High).** **Learning visibility must never be reduced.** Preferred: hints, team boosts, achievement rewards. Exploratory: visual effects, team abilities. These must remain teacher-controlled and disabled by default.

**CE-12 Design principle.** EduQuest optimizes `Cooperation -> Engagement -> Competition`, not `Competition -> Ranking -> Elimination`. The platform supports participation from students with different achievement levels.

### 12.2 Where this lands in the existing design

| Decision | Builds on / touches |
|---|---|
| CE-1, CE-2, CE-3 | New teacher-facing live-ish views over play activity. Need data M2-2.4 does not store (focus, stuck time, help state); see 12.4 |
| CE-4 | Restates and strengthens §11.8 (the requirement carried into M2-2.4). No new M2-2 scope |
| CE-5 | Changes where hint and reveal counters live in collaborative mode (team, not student) |
| CE-6 | Same feature as CC-4 (M2-3.4) |
| CE-7 | Extends CC-3 team identity |
| CE-8 | Extends CC-2 contribution visibility |
| CE-9, CE-10 | Same direction as CC-5 and CC-9 (and clarification #2 of §11.7) |
| CE-11 | Restates CC-7 and CC-8 more strictly |
| CE-12 | Same principle as §11.1 |

### 12.3 Overlaps with CC-1…CC-10

| CE | Overlaps with | What CE adds |
|---|---|---|
| CE-4 Shared attempt | CC-4 and §11.8 (shared-team attempt shape) | Elevates it to Very high and states the rule as "do not hard-code single-owner assumptions" |
| CE-6 Collaborative mode | CC-4 | Names "shared cells" and "shared completion"; Very high priority (CC-4 was High) |
| CE-7 Team identity | CC-3 (colour, icon, name) | **Badge** in place of CC-3's icon (see conflict 3 below) |
| CE-8 Contribution tracking | CC-2 | Adds "puzzle actions" and "support actions" as measures; adds "informational only" and the duty to explain that verbal collaboration is not measurable |
| CE-9 Progress boards | CC-5, §11.7 #2 | Adds milestones and a "next goal" on the board; explicit "over individual ranking and public score ordering" |
| CE-10 Classroom goals | CC-9 | Adds the example "all teams complete the puzzle" and the unit "cells" (CC-9 had "words") |
| CE-11 Safety | CC-7, CC-8 | Adds the absolute rule "learning visibility must never be reduced" |
| CE-12 Principle | §11.1 PM principle | Same text in different words |

CE-1, CE-2, CE-3 and CE-5 have **no counterpart** in CC-1…CC-10.

### 12.4 Conflicts and tensions

Numbered; each says how the two texts can be read together and what is still open.

1. **CC-8 vs CE-11 (visibility).** CC-8 lists "temporary visibility reduction" among exploratory effects; CE-11 says learning visibility must never be reduced. *Resolved by the PM (12.9 #1, K25 answered):* CE-11 supersedes CC-8. CE-11 is the later and stricter decision, so the "temporary visibility reduction" example of CC-8 is withdrawn. Exploratory effects stay limited to non-obscuring visual effects and team abilities that do not hide puzzle content, all disabled by default and teacher-controlled.
2. **CC-10 roadmap vs CE priorities.** CC-10 orders badges, class goals, team board, collaborative crossword, nickname leaderboards, team competition, classroom competition, seasons. Addendum 2 rates help requests (CE-1), the teacher awareness dashboard (CE-2), shared attempts (CE-4), collaborative mode (CE-6) and progress boards (CE-9) as Very high, but CE-1, CE-2 and CE-3 do not appear in CC-10 at all and collaborative mode is fourth. The PM has not revised CC-10. See 12.6 for a proposed insertion and K17.
3. **CC-3 vs CE-7 (icon or badge).** CC-3: colour, icon and name. CE-7: colour, name and badge. "Badge" may mean the team emblem (icon) or an achievement badge as in the M2-3.1 badge system. Not decidable from the text (K18).
4. **CE-3 and CE-1 vs the privacy stance.** Focus tracking ("current word, clue, area") and "time stuck" are behavioural monitoring of minors, more intrusive than final results. They need a governance decision (12.5 G1) and a retention rule; nothing in CC-1…CC-10 covered this. CE-2 puts teacher visibility above leaderboard visibility, which is consistent with a teacher-only view, but the data still has to exist.
5. **CE-5 vs the M2-2 presets.** Doc 04 §3.1 gives reveals and checks **per student** (`reveals_used`, `checks_used` on the individual attempt). CE-5 makes hints, reveals, help cards and extra clues **team-owned**. The two modes need different rules: individual assignments keep per-student limits; collaborative assignments use a team pool. This is consistent with §11.8 ("counters belong to the attempt") but means the preset values need a collaborative meaning (K22).
6. **CE-5 introduces resource types M2-2 does not have.** 초성 hints and word reveals exist in doc 04; "help cards" and "extra clues" do not. "Extra clues" implies additional teacher-authored clue text per word, which is new content and new authoring work (K22).
7. **C5 (one attempt per student) vs CE-4 (one attempt, many contributors).** Both hold, in different assignment modes: an **individual** assignment has one attempt per student; a **collaborative** assignment has one shared attempt per team. The assignment therefore needs a play mode, and a puzzle may or may not be allowed in both modes (K23).
8. **CE-1 may reach below M2-3.** "Students or teams may request assistance": a help button for individual play would belong with M2-2.4 play, which this addendum does not change. Treated as M2-3 (needs the teacher dashboard, CE-2, to be useful); M2-2.4 is not extended (K19).
9. **CC-2 vs CE-8 (visibility and use).** Compatible: contribution data is for teachers (CC-2), informational only (CE-8). New requirement from CE-8: every view of contribution figures carries the explanation that verbal collaboration cannot be measured, and the figures never feed a grade or a ranking.
10. **CC-9 vs CE-10 (units).** Words versus cells. Not a conflict; a goal metric can be completion %, words solved or cells solved (K24).

No decision in addendum 2 contradicts the approved M2-2 design. CE-4 and CE-5 only add constraints on shape and counters, handled by §11.8.

### 12.5 New governance questions

| # | Question | Why it is new |
|---|---|---|
| G1 | **Focus and stuck-time data (CE-1, CE-3).** Is the current word/clue/area and the time stuck stored, or only held live (not persisted, or kept for minutes)? Who may see it (teacher only, teammates)? What does the student or guardian have to be told? | Behavioural monitoring of minors; no counterpart in `docs/pilot/12`. Recommendation: treat as ephemeral by default, teacher-only, and say so in the notice |
| G2 | **Help requests (CE-1).** Fixed button only, no free text (consistent with `docs/pilot/12` §1)? Status lifecycle (open, acknowledged, resolved), retention, and who is notified. The screen must not imply that a teacher is always watching: a request is not a guarantee of an immediate response | A request is data about a student's difficulty; also a duty-of-care expectation |
| G3 | **Contribution disclaimer and use (CE-8).** Wording of the explanation; a written rule that contribution and help-request data are never used for grading, ranking or discipline | CE-8 requires the explanation; the prohibition on use is an addition |
| G4 | **Shared attempts and erasure (CE-4, CE-6).** When one student's data is erased, what happens to the team's shared attempt and to cells they filled: keep the attempt and detach the contributor (the cells and team progress stay, attribution becomes "removed member"), or delete? | The erasure procedure of `docs/pilot/12` cascades from `students`; a shared attempt belongs to several students at once |
| G5 | **Equity of team resources (CE-5).** Rules for who may spend a team resource and whether a student can be blocked from using the team's help | A governance and classroom-climate question, not only a UI one |

These join the gate of section 11.5: new data categories are help requests, focus data, resource spending and contribution attribution, in addition to those listed there.

### 12.6 Effect on the phase sketch (proposal, needs K17)

The sketch of section 11.6 stays as the PM-approved CC-10 order. Addendum 2 adds teacher-facing work that CC-10 does not place. Proposed placement, for the PM to confirm:

| Proposed phase | Delivers | Needs |
|---|---|---|
| M2-3.2b Teacher awareness dashboard | CE-2 for individual play: current puzzle, progress, hint usage, stuck time derived from autosave timestamps (`updated_at`, `active_seconds`); nothing student-visible | M2-2.4 live, M2-3.0 gate (G1, G3) |
| M2-3.2c Help request | CE-1: fixed-button request, status, teacher inbox on the dashboard | 3.2b, G2 |
| M2-3.3 (extended) Team progress board | CC-5/CE-9 board with milestones and next goal, team identity (CC-3/CE-7), contribution view with disclaimer (CC-2/CE-8) | 3.2 |
| M2-3.4 (extended) Collaborative crossword | CE-4/CE-6 shared attempt, CE-5 team resources, CE-3 focus tracking and team-level help request | 3.3, transport decision, G1, G4 |

CE-3 (focus tracking) needs events the M2-2.4 autosave does not produce (current word, clue, area); it cannot be derived and is built with the collaborative mode or with the awareness dashboard, whichever the PM places first.

### 12.7 Updates to the PM questions

Status of K10–K16 after addendum 2, and new questions K17–K25.

| # | Status | Update |
|---|---|---|
| K10 Team board form | **Answered in substance (CE-9)** | Progress and goal completion with a "next goal" (example "82% complete — next goal 90%"); public score ordering and individual ranking are disfavoured. Still to settle in implementation: whether any order of teams is shown (the example suggests none) |
| K11 Students see contribution? | Open | CE-8 only says teachers may review. Student visibility remains a future decision |
| K12 Nickname form | Open | Generated only (§11.7); assigned vs shortlist, teacher reset still open |
| K13 Badges cosmetic? | Partly addressed | CE-11 lists achievement rewards as preferred; whether they unlock anything is still open (see K18) |
| K14 Team boosts | Partly addressed | CE-11: team boosts are preferred; CE-11 also forbids reducing learning visibility, so a boost can never hide another team's content. Which boosts exist is still open (K22) |
| K15 One team per grid or whole class | Open, **leaning team grid** | CE-6 "shared completion" and CE-10 "all teams complete the puzzle" read most naturally as one grid per team with class goals across teams |
| K16 CC-8 effects scheduled? | **Narrowed** | Exploratory, disabled by default, teacher-controlled (CE-11); learning visibility is never reduced, so "visibility reduction" effects are out (conflict 1) |

| # | New question |
|---|---|
| K17 | Confirm the roadmap: place the teacher awareness dashboard (CE-2) and help request (CE-1) before the team board as proposed in 12.6, and whether collaborative mode (CE-6, Very high) moves earlier than fourth |
| K18 | CE-7 "badge": team emblem (the icon of CC-3) or an achievement badge of the M2-3.1 system, or both? Does a badge unlock anything? |
| K19 | CE-1 help request: teams only, or individual play too? Fixed button only (recommended) or any text? Who is notified and for how long is a request kept? |
| K20 | CE-3 focus tracking: stored or live only? Visible to teachers only or also to teammates? How is "time stuck" defined (inactivity threshold)? |
| K21 | CE-8 contribution: attribution rule when a cell is overwritten, definition of "support actions", exact disclaimer wording, and a written ban on using the figures for grades or rankings |
| K22 | CE-5 team resources: size of the pool per preset, who may spend it (any member, by vote, or with teacher approval), and who writes "extra clues" and "help cards" |
| K23 | Is the play mode (individual or collaborative) chosen per assignment, and can one puzzle be played both ways? |
| K24 | CE-10 class goals: which metrics (completion %, words, cells), per classroom or across classrooms, set by the teacher or from templates, and what happens when a goal is reached (cosmetic reward only?) |
| K25 | **Answered (12.9 #1):** CE-11 supersedes CC-8; learning visibility and puzzle readability are never reduced; visual effects may exist |

K11–K24 remain open and may be deferred until M2-3 implementation planning; they do not block M2-2 work (12.9 #3). K25 is answered. G1–G5 remain open governance questions for M2-3 planning and must be answered before the phases that need them (12.6, 12.9 #2).

### 12.8 Constraints for M2-2.4 (no scope change)

**Approved guidance for M2-2.4 (12.9 #4).** CE-4 repeats §11.8; nothing is added to M2-2.4 scope. For completeness, the shape constraints that make addendum 2 possible without redesign:

- Attempt, payload builder and checking are keyed by **attempt and puzzle**, never assume one author (§11.8, CE-4).
- Keep `updated_at` and `active_seconds` on the attempt as designed: they are the only inputs the individual-mode awareness dashboard (12.6) can use.
- Keep hint and reveal counters on the attempt, not on the student (CE-5).
- Do not add focus, presence or help-request fields in M2-2.4: they are M2-3 and need the governance answers G1 and G2 first.

### 12.9 PM review: approval and clarifications

The PM approved the §12 additions. Clarifications recorded with the approval:

| # | Clarification | Effect |
|---|---|---|
| 1 | **CE-11 supersedes CC-8.** Learning visibility must never be reduced. **Visual effects may exist. Puzzle readability may not be reduced.** | Answers K25 and resolves conflict 1 (12.4). The "temporary visibility reduction" example of CC-8 is withdrawn. Effects stay exploratory, disabled by default and teacher-controlled (CE-11). Any effect is judged by one test: it must not make the grid, the clues or the clue numbers harder to read. Concretely, an effect may not cover, blur, shrink, fade or reduce the contrast of puzzle cells or clue text, hide a clue, or delay showing the puzzle. Decoration around the puzzle, on team elements or in feedback moments is allowed. The accessibility conditions of §11.4 note 6 (no flashing or rapid motion, respect for reduced-motion settings and for students who need accommodations) still apply |
| 2 | **G1–G5 remain open governance questions for M2-3 planning.** | No governance answer is assumed. Nothing that needs G1 (focus and stuck-time data), G2 (help requests), G3 (contribution disclaimer and use), G4 (shared attempts and erasure) or G5 (equity of team resources) is built or scheduled before it is answered |
| 3 | **K17–K25 remain open and must not block current M2-2 work.** (K25 is answered by #1.) | K17–K24 are for M2-3 implementation planning. The phase order of 12.6 stays a proposal until K17 is answered |
| 4 | **The §12.8 attempt-model constraints remain approved guidance for M2-2.4.** | M2-2.4 design follows them (attempt and puzzle keyed, no single-author assumption, counters on the attempt, no focus, presence or help-request fields). They shape the design only; they add no scope |
