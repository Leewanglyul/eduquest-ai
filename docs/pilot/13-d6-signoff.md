# 13. D6 sign-off: consent, retention and erasure

Policy text: `12-d6-data-governance-policy.md` (consent §1, retention §2, erasure §3, teacher suspension §4). This page records the decision. Real students are not onboarded until every box in §4 is ticked (gate G3/G4 in `11`, required item R10).

## 1. Decisions

| # | Decision | Value | Policy section |
|---|---|---|---|
| 1 | Pilot data retention | **30 days after the pilot end date**, then deleted | 12 §2, §3.4 |
| 2 | Audit log retention | **1 year**, in de-identified form (username removed from `metadata`) | 12 §2, §3.3 |
| 3 | Who approves a deletion | **교무기획팀장** (or a deputy they name in writing) | 12 §3.1 |
| 4 | Deletion SLA | **7 days** from receipt of the request, approval included | 12 §3.1 |
| 5 | How student data is removed | Delete the student's `auth.users` row; the database cascades to profile, student record, account, enrollments and sessions | 12 §3.3 |
| 6 | Consent | Internal single-school educational pilot, teacher-created accounts only, no self-registration. **No guardian consent.** Students receive the notice and their acknowledgement is held by the class teacher before an account is created; kept outside EduQuest AI; withdrawal is an erasure request | 12 §1 |
| 7 | Teacher suspension | Ops sets `status = 'suspended'` and revokes sessions on written instruction; nothing is deleted | 12 §4 |
| 8 | Backups | Deleted data may remain in backups until they expire; deletions are re-applied from the ledger after any restore | 12 §3.5 |

## 2. Facts the school must fill in

| Item | Value |
|---|---|
| School name | |
| Pilot school id (`PILOT_SCHOOL_ID`) | |
| Pilot start date | |
| **Pilot end date** | |
| **Deletion deadline** (end date + 30 days) | |
| Supabase region | Seoul / other: |
| Backup retention of the plan (days) | |
| Auth and API log retention (days) | |
| Pilot classes and number of students (D4) | |
| Notice wording (12 §1.1) approved by the data-protection contact | yes / no: |
| Admin accounts at the end of the pilot | kept / deleted |
| Named deputy for deletion approval (optional) | |

## 3. Known limits accepted by signing

1. The system stores no consent record. The class teacher's acknowledgement list is the evidence.
   The pilot relies on its scope: internal, single school, teacher-created accounts, no public self-registration, no guardian consent. A change to any of these needs a new signed copy.
2. The audit log keeps opaque UUIDs and the acting teacher after a student is erased. With the student record gone they identify no one on their own; the username (derived from the student number) is removed.
3. A deleted student's data can exist in a backup until it expires (see §2 for the plan's days).
4. The erasure SQL is run by hand by Ops with a second person. There is no delete or export screen in M1.
5. Ownership transfer of a classroom does not exist in M1, so a suspended owner's class needs a co-teacher or an admin (12 §4.3).
6. The 7-day SLA counts calendar days from receipt; approval is inside it. A missed SLA is recorded with the reason, not hidden.

## 4. Conditions before real students

| ☐ | Condition | Evidence |
|---|---|---|
| ☐ | §2 table filled in | This page |
| ☐ | Notice text (12 §1.1) adapted and approved by the data-protection contact | Approved notice |
| ☐ | Notice given and acknowledged by every student to be created; list held by the class teacher | Acknowledgement list location |
| ☐ | Erasure rehearsed on staging with 12 §3.3 (ST-56 / VER-43), all counts 0, no username left in `audit_logs` | Query output |
| ☐ | Suspend and reactivate rehearsed on a test teacher (12 §4; ST-29 / VER-41) | Output |
| ☐ | Erasure ledger created, empty (12 §3.2) | Ledger location |
| ☐ | Deletion deadline entered in the pilot calendar | Calendar entry |
| ☐ | Ops and the second person have read 12 §3 and §4 | Names, date |

## 5. Signatures

By signing, each person confirms the decisions in §1, the limits in §3, and that the conditions in §4 will be met before any real student's data is entered.

| Role | Name | Signature | Date |
|---|---|---|---|
| 교무기획팀장 (approves deletions) | | | |
| School data-protection contact (개인정보 보호책임자) | | | |
| PM | | | |
| Ops (runs deletions) | | | |
| Second person (checks deletions) | | | |

## 6. Effect on the go-live decision

- Signed, with §4 complete: D6 and R10 are closed.
- Unsigned: **NO-GO for real students** (decision rules at gate G3 in `11`). Staging and test-data validation may continue.
- Any change to a value in §1 needs a new signed copy of this page.
