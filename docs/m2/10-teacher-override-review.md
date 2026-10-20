# 10. 교사 Override 검토 (분석 문서, 구현 없음)

Status: **APPROVED by the PM, 2026-10-20 (decisions in §6). Document only: no implementation until the Student Play release readiness is done.** 코드, 마이그레이션, 커밋 변경 없이 현재 구현을 읽고 쓴 문서입니다. 근거는 `src/features/crossword/` 코드, 마이그레이션 `20261018000002`, `20261018000003`, `20261019000003`, 그리고 문서 [07](07-m2-2-4-student-play-plan.md), [08](08-m2-2-4a-student-play-foundation-plan.md) C.5, [06](06-m2-3-competition-framework.md) CE-11입니다. 확인하지 못한 부분은 "미확인"으로 적었습니다.

Student Play 공개는 NO-GO 상태이고(`CROSSWORD_PLAY_ENABLED` OFF), 이 문서는 그 결정과 무관한 설계 검토입니다.

## 1. 현재 상태

### 1.1 `settings.play`에 있는 것

퍼즐 행(`crossword_puzzles.settings`, jsonb)의 `play` 키에 다음 5개가 저장됩니다. 값은 `settingsForLevel(level)`(`generator/difficulty.ts`)이 난이도 프리셋에서 만들고, 저장은 `review/service.ts:282`입니다.

| 키 | 의미 | easy | normal | hard |
|---|---|---|---|---|
| `prefillPercent` | 미리 채워 주는 칸 비율(낱말이 완성되지 않는 선까지) | 프리셋 값 | 프리셋 값 | 프리셋 값 |
| `revealsPerStudent` | 글자 알려주기 횟수 | 3 | 2 | 1 |
| `checksAllowed` | 확인 횟수(`null`=무제한, `0`=없음) | 무제한 | 5 | 3 |
| `checkMode` | `anytime`(칸·낱말·전체) / `onRequest`(낱말) / `submitOnly` | anytime | onRequest | onRequest |
| `chosungAllowed` | 초성 보기 허용 | 예 | 예 | 아니오 |

`prefillPercent`의 정확한 값은 `DIFFICULTY_PRESETS`에 있고 이 문서는 읽지 않았습니다(미확인). 위 표의 횟수는 문서 08 C.5(PM SP-1/SP-2)와 `constants.ts`의 `PLAY_DEFAULT_ALLOWANCES`로 확인했습니다.

`settings.play`가 아닌 곳에 고정된 값(코드 상수, `play/constants.ts`와 SQL):

- 자동 저장 2초 디바운스, 마감 후 저장 유예 120초.
- 확인 속도 제한 분당 60회.
- 오답 제출 후 대기 30초(hard는 처음부터, 나머지는 세 번째 오답부터).
- 시도는 학생·배정당 1개이고 **다시 시작이 없습니다**(문서 07 E.5, practice 모드는 §I에서 M2 밖으로 미룸).

배정(`crossword_assignments`)에는 `status`(open / closed), `opens_at`, `closes_at`가 있습니다.

### 1.2 교사가 바꿀 수 있는 것과 없는 것

| 항목 | 교사 변경 | 근거 |
|---|---|---|
| 난이도(level) | **가능**(초안 단계에서). 바꾸면 위 5개 값이 프리셋으로 다시 정해짐 | `saveDraftSchema`에 `level`이 있고 `play`는 `settingsForLevel(level)`로만 만들어짐 |
| `settings.play` 개별 값(확인 횟수, 알려주기 횟수 등) | **불가능** | 입력 스키마에 없음. 게시된 퍼즐은 트리거가 `settings` 변경을 거부함(`20261018000002`) |
| 게시 후 settings | **불가능**, 새 버전을 만들어 다시 게시해야 함 | 같은 트리거(`CROSSWORD_PUBLISHED_IMMUTABLE`) |
| 배정 마감(close) | **가능**(되돌릴 수 없는 닫기) | `closeCrosswordAssignmentAction` |
| 열기·마감 시각 | 게시 또는 배정 추가 때만 지정 | `fn_publish_crossword`, `fn_add_crossword_assignments`의 `p_opens_at/p_closes_at`. 수정 경로는 미확인 |
| 시도 초기화, 재시도 허용 | **불가능** | 해당 기능 없음 |
| 학생별 예외 | **불가능** | 없음 |

### 1.3 Student Play에 적용되는 방식

- 한도는 **퍼즐 단위**입니다. 같은 퍼즐을 여러 교실에 배정하면 모두 같은 한도를 씁니다.
- 열 때 `fn_crossword_play_start`가 한도를 payload에 담고(`fn_crossword_play.sql:131-139`), 확인·알려주기는 DB가 시도의 카운터(`checks_used`, `reveals_used`)와 비교해 강제합니다(`CROSSWORD_PLAY_CHECK_LIMIT`, `…REVEAL_LIMIT`). 화면은 남은 횟수만 보여 줍니다.
- `checksAllowed`가 없는 옛 퍼즐은 `submitOnly`=0, 그 외=무제한으로 읽습니다.
- 마감 후 열면 읽기 전용이 되고 쓴 글자는 볼 수 있습니다.

## 2. Gap Analysis

수업에서 교사가 조정하고 싶어 할 만한 항목과 현재 지원 여부입니다.

| # | 항목 | 지금 | 메모 |
|---|---|---|---|
| G1 | 힌트 횟수(확인, 알려주기) 조정 | **미지원**(난이도 프리셋만) | 이미 PM 결정 SP-1/SP-2에서 "교사가 override 가능"으로 약속됨 |
| G2 | 초성 허용 끄기·켜기 | 미지원 | 프리셋(hard는 끔) |
| G3 | 마감 시각 연장(수업이 길어질 때) | **미지원 또는 미확인**: 닫기만 확인함 | 수업 중 가장 자주 필요할 가능성이 큼 |
| G4 | 열기/닫기(공개·비공개) | **지원** | 열기 시각 지정, 닫기 버튼. 닫은 배정을 다시 여는 기능은 없음 |
| G5 | 재시도 허용 / 시도 초기화 | 미지원(의도적) | 문서 07 §I: 어떤 시도가 기록에 "계산되는지" 규칙이 먼저 필요 |
| G6 | 시간 제한 | **의도적으로 미지원** | CW-11: 타이머와 카운트다운 없음 |
| G7 | 자동 제출 | 미지원 | 시간 제한과 같은 부류, 학생이 낸 적 없는 제출이 생김 |
| G8 | 난이도 조정(게시 후) | 불가(새 버전으로만) | 게시된 퍼즐은 불변이 설계 의도 |
| G9 | 학생 한 명에게 추가 도움(접근성 배려) | 미지원 | 학습 프로필과 맞물림 |
| G10 | 미리 채워 주는 칸 비율 조정 | 미지원 | 퍼즐 생성 시점에 결정됨 |
| G11 | 게임 효과(시야 축소 등) | 없음 | CC-8, CE-11이 제한함 |

## 3. 최소 Override 설계안

### 3.0 원칙과 해석

- **학습 가시성 감소 금지, 퍼즐 가독성 감소 금지(CE-11).** 어떤 override도 칸, 글자, 단서의 표시, 크기, 대비를 줄이지 않습니다.
- **Galaxy Tab 사용성 유지.** override는 교사 화면의 설정입니다. 학생 화면에는 새 컨트롤을 추가하지 않고, 학생에게 보이는 것은 지금처럼 "남은 n번"뿐입니다.
- **이 문서의 해석(PM 확인 필요):** 힌트 횟수를 *줄이는* 것은 "가시성 감소"가 아니라 도구 허용량의 조정으로 봅니다. 다만 도움을 줄이는 방향은 교사 판단이고, 어떤 경우에도 퍼즐 표시 자체를 가리지 않습니다. PM이 이 구분에 동의하는지 확인이 필요합니다.
- 변경은 감사 로그(`audit_logs`)에 남기고, 학생에게는 변경 내용을 점수나 벌점처럼 보이게 쓰지 않습니다.

### 3.1 설계 골격(공통)

저장 위치는 **퍼즐이 아니라 배정**을 권합니다. 퍼즐 `settings`는 게시 후 불변이고 교실이 여러 개일 수 있으므로, 같은 퍼즐을 교실마다 다르게 쓰려면 배정 단위가 맞습니다.

- `crossword_assignments`에 `play_override jsonb`(NULL=프리셋 그대로)를 추가하고, 허용 키를 CHECK 함수로 제한합니다(이벤트 `detail`의 허용 목록 방식과 같은 패턴).
- 한도 조회(payload 빌더, 확인, 알려주기, 초성 함수)가 `COALESCE(assignment.play_override -> k, puzzle.settings -> 'play' -> k)`로 읽습니다.
- 교사 쪽은 배정 목록에 "수업 설정" 패널 하나를 둡니다. 서버 액션과 서비스 함수가 하나 추가됩니다.
- 한도를 이미 쓴 학생의 시도에는 **이후 사용분부터** 적용합니다. 남은 횟수는 `max(0, 한도 − 사용)`로 표시하고 음수나 "초과" 표현은 쓰지 않습니다.

### Level 1: 반드시 필요한 override

| ID | Override | 내용 |
|---|---|---|
| L1-1 | **확인 횟수, 알려주기 횟수** (G1) | 배정 단위로 `checksAllowed`(`null`/숫자), `revealsPerStudent`(숫자) 지정. PM 결정 SP-1/SP-2에서 이미 약속됨. 허용 범위는 0~(칸 수 또는 상한)으로 제한 |
| L1-2 | **마감 시각 연장** (G3) | 열려 있는 배정의 `closes_at`를 늦추기(앞당기기는 "닫기"로 이미 가능). 수업이 길어질 때 가장 필요. 기존 수정 경로가 있는지 먼저 확인 필요 |

### Level 2: 있으면 좋은 override

| ID | Override | 내용 |
|---|---|---|
| L2-1 | 초성 허용 켜기/끄기 (G2) | 배정 단위 불리언 |
| L2-2 | 닫은 배정 다시 열기 | 지금은 닫기가 되돌릴 수 없음. 실수 복구용 |
| L2-3 | 학생 한 명에게 추가 도움 (G9) | 학생·배정 단위 알려주기 추가분. 데이터 모델이 학생을 가리키므로 거버넌스 14와 학습 프로필 정리 후가 안전 |
| L2-4 | 열기 시각 수정 | 게시 때만 지정 가능한 값을 나중에 수정 |

### Level 3: M2-5 이후 검토

| ID | Override | 이유 |
|---|---|---|
| L3-1 | 시도 초기화 / 재시도 (G5) | "기록에 계산되는 시도" 규칙, 학습 프로필, 교사 쪽 리셋(M2-2.5)과 함께 설계 필요(문서 07 §I) |
| L3-2 | 연습 모드 | 같은 이유로 문서 07 §I에서 M2 밖으로 정함 |
| L3-3 | 시간 제한, 자동 제출 (G6, G7) | **CW-11과 충돌.** 하게 되더라도 "교사가 보는 진행 시계" 정도이고 학생에게 압박을 주는 타이머는 아님. PM의 별도 결정 없이는 설계하지 않음 |
| L3-4 | 게시 후 난이도 변경 (G8) | 불변 설계. 새 버전 발행이 정답 |
| L3-5 | 게임 효과 (G11) | CC-8 탐색 항목. **CE-11에 따라 기본 OFF, 교사 제어, 학습 가시성 감소 금지**. 접근성 검토 전에는 일정 없음 |

## 4. 영향도

| ID | DB 변경 | API/서비스 변경 | UI 복잡도 | 운영 리스크 |
|---|---|---|---|---|
| L1-1 확인·알려주기 횟수 | **필요**: 배정 컬럼 1개, CHECK 함수, 한도 조회 함수 수정(`fn_crossword_play_*` 4~5개) | 서비스 1 + 액션 1, payload는 이미 한도를 내려줌 | 낮음: 숫자 입력 2개 | **중간**: 호스팅 DB 변경이므로 PM 승인 절차 필요, 이미 시도 중인 학생과의 일관성 규칙 필요 |
| L1-2 마감 연장 | 낮음~없음: 컬럼은 있음. 수정 함수나 트리거 제약은 미확인 | 서비스 1 + 액션 1 | 낮음: 날짜 선택 1개 | 낮음. 마감 후 저장 유예(120초)와 같이 쓰는 경우 확인 |
| L2-1 초성 | L1-1과 같은 컬럼의 키 하나 추가 | 없음(같은 액션) | 낮음 | 낮음 |
| L2-2 다시 열기 | 필요: `chk_crossword_assignment_closed`(닫힘 ⇔ `closed_at`)와 상태 전이 함수 | 서비스 1 | 낮음 | 중간: 마감 후 데이터가 "닫힘" 상태로 이미 읽혔을 수 있음 |
| L2-3 학생별 추가 도움 | 필요: 새 테이블 또는 컬럼(학생 데이터) | 서비스·액션, 조회 함수 수정 | 중간: 학생 선택 UI | **높음**: 학생 데이터 추가, 거버넌스 14 개정 필요 |
| L2-4 열기 시각 수정 | 낮음 | 서비스 1 | 낮음 | 낮음 |
| L3-1~L3-5 | 모두 큼 | 큼 | 중간~큼 | 높음(데이터 의미, 정책, 접근성) |

공통:

- **Galaxy Tab 영향:** 학생 화면 변경 없음(한도는 이미 payload로 옴). 교사 화면은 PC 중심이라 태블릿 영향은 작습니다.
- **hosted 반영:** 어떤 DB 변경이든 영향도 보고 → PM go → `db push` 순서(2026-10-20에 정한 규칙)를 따릅니다. 로컬에서 pgTAP로 한도 우선순위, 사용 후 변경, 음수 방지를 검증합니다.
- **테스트 필요:** 배정 override가 퍼즐 값보다 우선하는지, 두 교실이 같은 퍼즐을 다른 한도로 쓰는지, 한도를 줄여도 이미 쓴 글자는 그대로인지, 학생 payload와 이벤트에 답이 새지 않는지(기존 정적 가드 유지).

## 5. 권고안

| 분류 | 항목 | 이유 |
|---|---|---|
| **지금 구현 추천** | L1-1 확인·알려주기 횟수, L1-2 마감 연장 | PM이 이미 약속한 override와 수업 중 가장 필요한 조정. DB 변경은 배정 컬럼 하나와 함수 수정으로 작고, 학생 화면 변경이 없음. 단, 구현 시점은 "Student Play 공개"와 별개이고 hosted 반영은 별도 승인 |
| **M2 후반으로 이동 추천** | L2-1 초성, L2-2 다시 열기, L2-4 열기 시각 수정 | 유용하지만 L1과 같은 틀 위에 쉽게 얹을 수 있음. L1을 만든 뒤 한 번에 묶는 것이 효율적 |
| **M3(또는 M2-5 이후)로 이동 추천** | L2-3 학생별 추가 도움, L3-1 시도 초기화, L3-2 연습 모드, L3-5 게임 효과 | 학생 데이터 모델, 학습 프로필, 접근성 검토와 맞물림 |
| **하지 않음(PM 별도 결정 전까지)** | L3-3 시간 제한, 자동 제출 | CW-11 충돌 |

PM이 정할 것:

1. §3.0 해석: 힌트 횟수 조정은 CE-11의 "가시성 감소"에 해당하지 않는다고 봐도 되는지.
2. override 저장 단위를 퍼즐이 아니라 **배정**으로 하는 것에 동의하는지.
3. L1-1과 L1-2를 한 묶음으로 구현할지, L1-2(마감 연장)를 먼저 할지.
4. 마감 연장 시 기존 수정 경로가 있는지는 구현 전에 코드로 확인하겠습니다(현재 미확인).

## 6. PM decisions (2026-10-20)

1. The review does not conflict with CE-11. **Rule: an override may never go below the default.** The preset value of a puzzle (§1.1) is the floor, so an override can only add support (more checks, more reveals, a later close), never remove it. This replaces the reading of §3.0 that allowed lowering a limit; any 'reduce hints' use is out of scope.
2. Overrides are stored on `crossword_assignments` (not on the puzzle).
3. Priority: **P1** check-count override, **P2** reveal-count override, **P3** close-time extension. (§3 listed checks and reveals together as L1-1; they are now two steps, and the close extension is third.)
4. Level 2 and Level 3 are outside the current scope.
5. The policy that puzzle settings are immutable after publishing stays until a separate review.

Scope: this document is kept as is. **No implementation work starts.** After the Student Play release readiness is finished, the M2 scope is re-evaluated. Open points that remain for that re-evaluation: whether an existing path to change `closes_at` exists (§4, unchecked), and the floor rule's effect on the DB check (the CHECK function must compare an override to the puzzle's own value, not to a constant).
