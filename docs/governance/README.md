# Governance

This folder holds the governance documents that decide how EduQuest features are designed and built. Documentation
only: nothing here changes code, schema, flags or deployments by itself.

## Hierarchy

A lower level must follow every level above it. When two documents disagree, the higher one wins and the conflict is
reported to the PM before work continues.

| Level | Document | Role |
|---|---|---|
| 1 | Product principles: [PROJECT_CONSTITUTION](../../PROJECT_CONSTITUTION.md) | value order, non-negotiable rules and their interpretation |
| 2 | [Collaboration Governance Package v1](eduquest-collaboration-governance-package-v1.md) | vision, information boundary, behaviour model, approved / rejected / deferred features, priorities, PM clarifications (section G), structured collaboration signals (section H) |
| 2 | [Teacher Dashboard and Classroom Operations v1](teacher-dashboard-and-classroom-operations-v1.md) | how a teacher runs a Course Room session: modes, teams, identification, dashboard, help requests, scoring |
| 2 | [Teacher Package Specification v1](teacher-package-specification-v1.md) (approved) | teacher-facing workflows: Course Room, roster, teams, modes, session controls, dashboard, results review |
| 2 | [Operational UX Principles v1.0](operational-ux-principles-v1.md) (approved) | operational constraints for classroom use (OX-1 to OX-13) with validation criteria; classroom operation and team competition rules |
| 2 | [Design Vision v1](design-vision-v1.md) (conditionally approved) | experience principles; combo, growth, badge, character, student agency decisions; visual expression provisional until student validation |
| 2 | [Growth Model and Mastery v1](growth-model-and-mastery-v1.md) (approved) | what counts as growth, the word lifecycle, recall rules, personal dictionary, teacher view, retention |
| 2 | [Long-Term Product Direction v1](long-term-product-direction-v1.md) (conditionally approved) | stages: teacher operated → teacher supported → student agency in teacher-governed learning → teacher community first; gates LT-1 to LT-3; KPIs; data ownership |
| 3 | Feature packages (`docs/m2/`, readiness and implementation packages, design docs) | what a feature does and how it is built |
| 4 | Gate procedures (acceptance runbooks, H-procedures, Gate 1 / 2 / 3 checklists) | how a change is verified and released |

**The Collaboration Governance Package is authoritative for all collaboration-related design, implementation, UX and
analytics decisions.**

Data governance documents in `docs/pilot/` (data list, notices, retention, deletion, sign-off) sit beside level 2: a
collaboration feature must satisfy both before real students use it.

Terminology: the unit of operation is the **Course Room** (classroom, elective course, credit course, club, workshop).
Older documents that say "classroom" mean a Course Room unless they describe the current schema.

## Review levels

| Level | Review |
|---|---|
| R1 | Internal Project Review |
| R2 | Same-Session Red Team Review (not an independent review) |
| R3 | Independent AI or Expert Review |
| R4 | Teacher / Student Field Validation |

Every governance document records which level of review it has had.

## How to use it

Every collaboration proposal:

1. cites the governance package section it relies on;
2. lists conflicts with the package before anything else, and stops for a PM decision when there is one;
3. explains how it aligns with the constitution and the package.

## Changing a document

Only the PM approves a change. A change is recorded as a new version (for example v1.1) with the decision date, and
documents at lower levels that it affects are listed in the same change.
