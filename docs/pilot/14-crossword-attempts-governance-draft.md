# 14. Crossword attempts: data governance draft

Status: **DRAFT for the PM and the school's data-protection contact. Not in force. Not for signature. PM review: GO on 2026-10-19 (see §8); doc 13 is not yet re-signed.** Written 2026-10-18 with M2-2.4a F1 (`supabase/migrations/20261019000001`–`3`). The signed D6 documents ([12](12-d6-data-governance-policy.md), [13](13-d6-signoff.md)) are **not modified** by this draft; this text becomes revisions of 12 and 13 only after approval, and 13 must then be signed again for the new data.

Go-live gate (doc 04 C13/CW-13, doc 07 E.1): **no real student may play a crossword before this is approved and 13 is re-signed.** The tables exist and are empty; nothing writes to them until the student screens exist (M2-2.4b+), which are not built yet.

Scope: one student solving one crossword alone. Teams, shared attempts, competition, badges and leaderboards are M2-3 and need their own governance entries (doc 06 §6, §12.5 G1 to G5, product note 01 §6.3).

## 1. What is stored (new rows for doc 12 §0.1)

| Data | Table | Content | Linked to a student? | Removed with |
|---|---|---|---|---|
| Attempt state | `crossword_attempts` | the letters the student typed (`cells`), the keys of pre-filled and revealed cells, counters (checks, reveals, 초성, wrong submits), active time in milliseconds, a revision number, start, last-save and completion times | **No.** The attempt row holds no student id | with its last member, with the assignment, or with the puzzle |
| Attempt membership | `crossword_attempt_members` | which student the attempt belongs to, and when they joined | **Yes** (student id) | with the student (cascade) |
| Attempt events | `crossword_attempt_events` | when a hint, reveal or submit happened: kind, source (`hint`, `reveal`, `submit`), the acting student (nullable), and **only** the word number and direction concerned; on the one `completed` event also `wordsCompleted` (a count, see below) | Yes, through the attempt and the optional actor | with the attempt; the actor is cleared if the student is erased |

**What an event never contains** (enforced by a database CHECK and by a test that tries to store each of these): an answer, a letter, solved content, a cell position, free text. The content is `{"scope": "cell" | "word" | "puzzle", "words": [{"number": n, "direction": "across" | "down"}]}` with at most two word references, and nothing else, except `wordsCompleted` on a `completed` event.

**`wordsCompleted` (PM decision, 2026-10-18).** When a student submits and every cell is right, the server counts the words that are fully correct and writes that one whole number into the `completed` event, once. It is a count, not a record of which words or what was typed. It exists so a later own-growth view can say how many words a finished puzzle held without re-reading the puzzle, and so shared-attempt and contribution tracking have a per-attempt figure to build on. Rules: it is written by the server only at completion (a database CHECK refuses it on any other kind of event and anything but a number of at most three digits); no screen, payload or API reply shows it to the student; there is no value for an unfinished attempt (no running count, so it can never act as a free check); it is erased with the attempt. Because the attempt can only be completed when all words are correct, today the number equals the puzzle's word count; it is kept as a separate figure so it stays meaningful if a later phase allows another way to finish.

**Reserved, not collected.** The event source values `manual_entry` and `autosave` exist in the schema for later learning analytics, and no code writes them in this phase. Recording a per-save or per-entry event would be new collection and needs its own approval (§6, question Q3).

**Typed letters.** `cells` holds what the student typed, including wrong letters. It is the student's own work product and is needed to resume a puzzle on another device. It is never copied to browser storage (shared school devices), never logged, and never sent to another student.

**Not collected in this phase:** keystrokes or timing between keystrokes, the selected cell or word, cursor or focus data, time stuck, presence, help requests, per-word correctness, scores, ranks, comparison data, device identifiers. "Active time" is a total of seconds with activity, clamped by the server; it is not a recording of behaviour.

## 2. Purposes

1. Let a student continue a puzzle and see their own finished grid and a plain summary of the tools they used ("도구를 활용했어요").
2. Enforce the rules the teacher chose (number of reveals, check mode) and limit misuse (rate limits, cooldown after wrong submissions).
3. Keep the facts a later **own-growth** view needs (completion, time, tool use) so a student can compare with their own past before anything else. No ranking, grade, discipline or placement use, ever.

Not purposes: grading, ranking, comparison between students, monitoring of behaviour, advertising, profiling outside the school.

## 3. Who can see it

| Who | Access in this phase |
|---|---|
| The student | their own puzzle list, play screen and result, built by server code from an allow-list. No direct table access |
| Teachers, admins | **none yet.** There is no teacher read policy; results for teachers are M2-2.5 and need their own migration, review and an addition to this document |
| Other students | none |
| Anyone through the Supabase API | none: Row Level Security is on, there is no policy, and all client privileges on the three tables are revoked (tests prove a student, a teacher and an anonymous caller are refused) |
| Operations staff with database access | yes, as for all pilot data (doc 12 assumptions) |

All access goes through server code using the service role. Because of that the rule that no answer reaches a student path is enforced in code and by tests, not by RLS (doc 08 §C.9).

## 4. Retention and erasure

- **Retention:** same as the pilot data, **30 days after the pilot end date** (doc 12 §2). No separate period is proposed.
- **Student erased:** the membership row is deleted with the student; when no member is left the attempt and its events are deleted too. With one member this means the attempt disappears with the student.
- **Puzzle, assignment or classroom deleted:** attempts under them are deleted by cascade.
- **End-of-pilot order:** the existing order (puzzles before teachers) already removes attempts through the assignments. No new `delete` statement is required for correctness. Rehearsal on staging must confirm the counts below reach zero.
- **Backups:** as doc 12 §3.5.
- **Shared attempts (future):** what happens to an attempt when only one of several members is erased is open governance question G4 of doc 06 §12.5. The current rule (the attempt stays until its last member goes) is a placeholder with a test, not a decision.

Additions proposed for the verification queries of doc 12 §3.3 and §3.4:

```sql
select
  (select count(*) from public.crossword_attempt_members where student_id = '<student_id>') as attempt_memberships,
  (select count(*) from public.crossword_attempts a join public.crossword_assignments x on x.id = a.assignment_id
     join public.crossword_puzzles p on p.id = x.puzzle_id where p.school_id = '<school_id>') as crossword_attempts,
  (select count(*) from public.crossword_attempt_events e where e.actor_student_id = '<student_id>') as attempt_events_by_student;
```

## 5. Notice text (Korean, for the school to adapt)

> 낱말 퍼즐을 풀 때 다음이 저장됩니다: 내가 입력한 글자, 힌트(확인, 글자 알려주기, 초성)를 쓴 횟수와 어느 낱말에 썼는지(낱말 번호와 가로/세로만 기록하며 정답이나 글자는 기록하지 않음), 푼 시간의 합계, 완성 여부.
> 이 기록은 이어서 풀기와 내 결과 화면을 위해서만 쓰이며 성적, 순위, 평가에 사용하지 않습니다. 다른 학생에게 보이지 않습니다.
> 보관 기간: 시범 운영 종료일로부터 30일 후 삭제

## 6. Questions for the PM and the school contact

| # | Question | Engineering recommendation |
|---|---|---|
| Q1 | Is storing typed letters (including wrong ones) acceptable as the student's own work product? | Yes; needed to resume |
| Q2 | Is recording the word number and direction of each hint use acceptable? (It lets a later profile say "words that needed a tool" without any answer content.) And the one `wordsCompleted` count on the completed event (§1)? | Yes to both; no letters, no cell positions, the count is server-only and never shown to the student |
| Q3 | May a later phase record entry or autosave events (the reserved sources)? | Not now; decide with the Student Learning Profile |
| Q4 | Does the notice in §5 need guardian notice or consent beyond what doc 12 §1 already requires? | A question for the school contact |
| Q5 | When teachers get results (M2-2.5): which teachers may see an individual's attempt: classroom owner and co-teachers only, or the whole school? | Classroom owner and co-teachers (doc 04 §5.5) |
| Q6 | Shared attempts (G4): keep-and-detach or delete when one member is erased? | Decide in M2-3 planning, not now |

## 7. What happens after approval

1. Fold §1 to §4 into doc 12 (§0.1 rows, §2 retention row, §3.3/§3.4 queries, §5 assumption) and §5 into the notice of §1.1.
2. Re-sign doc 13 for the new data.
3. Rehearse the erasure procedure on staging with a student who has an attempt; record the zero counts.
4. Only then enable the student screens for real students.

None of these steps is done by M2-2.4a F1.


## 8. PM review record (2026-10-19)

**Decision: GO** for the governance review of this draft. Reasons given by the PM: (1) the data is needed for the learning record; (2) it is the base data of the Student Profile feature; (3) students never see each other's real names; (4) the student-erasure rule was checked; (5) the pilot Student Play validation needs it.

What this GO covers: creating the attempt tables on the hosted project (migrations `20261019000001`-`4`, with their `…17`/`…18` predecessors) so the pilot validation can run, and the hosted erasure smoke test with test accounts. The erasure rule of §4 now works with the auth-user path (`d5e329a`: GoTrue `deleteUser` with an attempt was HTTP 500 before the fix).

What it does **not** cover, and is still open before any real student plays (§7): the answer to Q4 (guardian notice, school contact), folding §1-§5 into doc 12, **re-signing doc 13**, and the staging erasure rehearsal with recorded zero counts. `CROSSWORD_PLAY_ENABLED` stays unset on hosted until those are done. Q3 (entry/autosave events) and Q6 / G4 (shared attempts) stay as recommended in §6: not now.
