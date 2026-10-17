# M2 design documents

| # | Document | Purpose |
|---|---|---|
| 1 | [CSV content pipeline](01-csv-content-pipeline.md) | Design of M2-1: teacher CSV upload (`term,definition`) into word sets for later question, crossword and game generation: schema, database and RLS, upload workflow, validation and messages, storage model, teacher management workflow, future consumers, test plan, open decisions |
| 2 | [M2-1 implementation plan](02-implementation-plan.md) | Phases M2-1.1 Schema, 1.3 Validation, 1.2 Upload, 1.4 Teacher management, 1.5 Export: build order, gating decisions, migration / service / UI / test file lists, exit criteria |
| 3 | [Implementation review](03-implementation-review.md) | M2-1.1 / 1.3 review package with a resolution table |
| 4 | [Crossword generator (M2-2)](04-crossword-generator.md) | Design of the crossword generator: grid strategy, placement algorithm, difficulty rules, teacher review workflow, student play workflow, database impact, phases, tests, open decisions |
| 5 | [M2-2.2 teacher review plan](05-m2-2-2-teacher-review-plan.md) | Implementation plan for the teacher side of the crossword: readiness score, unlimited regenerate, draft review, publish, immutability, migrations 22-24, services, screens, tests, open questions |
| 6 | [M2-3 competition framework](06-m2-3-competition-framework.md) | Future planning only (no scope change to M2-2): individual, team and classroom competition, leaderboards, seasonal events, privacy and governance impact, future schema impact; PM addendum CC-1…CC-10 (collaboration first, generated nicknames, team progress boards, class goals, revised M2-3 order) |
| 7 | [M2-2.4 student play plan](07-m2-2-4-student-play-plan.md) | Implementation plan for individual crossword solving: student list and access, play screen, cell input and Korean IME handling, server-side checks and reveals, autosave, completion, result screen, attempt/member schema (no single-owner assumption), student security and RLS review, tests, phases, open PM decisions |

| 8 | [M2-2.4a student play foundation plan](08-m2-2-4a-student-play-foundation-plan.md) | Foundation slice of doc 7 (F0 IME validation, F1 schema, F2 play core, F3 service and bare board): corrections to doc 7, first real IME trace evidence, Korean IME rules R1–R10, API contract, IME validation requirements, phase mapping |

Documents 1–3 describe M2-1, which is implemented on `m2/m2-1-content-pipeline`. Document 4 is the M2-2 design; its generator core (M2-2.1) is implemented. Document 5 is the canonical plan for M2-2.2: schema (2a), readiness (2b) and the teacher backend (2c) are implemented, screens (2d) and hardening (2e) are not. Document 6 is future planning only: nothing in it is scheduled or implemented.
