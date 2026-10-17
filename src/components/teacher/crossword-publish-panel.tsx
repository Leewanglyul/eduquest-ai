"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addCrosswordAssignmentsAction,
  publishCrosswordAction,
} from "@/features/crossword/review/actions";
import { useCrosswordAction } from "./use-crossword-action";
import { BTN_PRIMARY, CHECK_BOX, CHECK_ROW, INPUT } from "./crossword-ui";

type Classroom = { id: string; name: string };

type Props = {
  puzzleId: string;
  /** publish: a draft becomes published. add: a published puzzle is given to more classrooms. */
  mode: "publish" | "add";
  classrooms: Classroom[];
  /** Classrooms that already have this puzzle (add mode: shown as taken). */
  assignedIds?: string[];
  /** Publish mode: classrooms preselected, usually those that had the previous version. */
  preselectIds?: string[];
  version: number;
};

const toIso = (local: string): string | null => (local ? new Date(local).toISOString() : null);

/**
 * Publishing freezes the puzzle: grid, words, clues and title can no longer change, only a new version can. The confirm
 * box says so before the button works. Adding classrooms later does not touch the puzzle.
 */
export function CrosswordPublishPanel({
  puzzleId,
  mode,
  classrooms,
  assignedIds = [],
  preselectIds = [],
  version,
}: Props) {
  const router = useRouter();
  const taken = new Set(assignedIds);
  const free = classrooms.filter((c) => !taken.has(c.id));
  const [selected, setSelected] = useState<Set<string>>(
    new Set(preselectIds.filter((id) => free.some((c) => c.id === id))),
  );
  const [opens, setOpens] = useState("");
  const [closes, setCloses] = useState("");
  const [confirmed, setConfirmed] = useState(mode === "add");

  const publish = useCrosswordAction(publishCrosswordAction);
  const add = useCrosswordAction(addCrosswordAssignmentsAction);
  const active = mode === "publish" ? publish : add;

  useEffect(() => {
    if (active.state?.ok) router.refresh();
  }, [active.state, router]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      puzzleId,
      classroomIds: [...selected],
      opensAt: toIso(opens),
      closesAt: toIso(closes),
    };
    active.submit(payload);
  }

  const windowInvalid = opens !== "" && closes !== "" && new Date(opens) >= new Date(closes);
  const heading = mode === "publish" ? "학급에 배포" : "다른 학급에 추가";

  if (free.length === 0) {
    return (
      <section aria-labelledby={`pub-${mode}`}>
        <h2 id={`pub-${mode}`} className="mb-2 text-base font-semibold">
          {heading}
        </h2>
        <p className="text-sm text-slate-600" role="status">
          {classrooms.length === 0
            ? "배포할 수 있는 학급이 없습니다. 학급을 먼저 만들어 주세요."
            : "내 모든 학급에 이미 배포했습니다."}
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby={`pub-${mode}`}>
      <h2 id={`pub-${mode}`} className="mb-2 text-base font-semibold">
        {heading}
      </h2>
      <form onSubmit={onSubmit} className="space-y-4">
        <fieldset>
          <legend className="text-sm font-medium">학급 선택</legend>
          <ul className="mt-1 space-y-1">
            {classrooms.map((c) => (
              <li key={c.id} className="text-sm">
                <label className={CHECK_ROW}>
                  <input
                    type="checkbox"
                    className={CHECK_BOX}
                    checked={selected.has(c.id)}
                    disabled={taken.has(c.id)}
                    onChange={() => toggle(c.id)}
                  />{" "}
                  {c.name}
                  {taken.has(c.id) ? (
                    <span className="ml-2 text-xs text-slate-600">(이미 배포됨)</span>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <div className="flex flex-wrap gap-4">
          <div>
            <label htmlFor={`opens-${mode}`} className="block text-sm">
              시작 시각 (선택)
            </label>
            <input
              id={`opens-${mode}`}
              type="datetime-local"
              value={opens}
              onChange={(e) => setOpens(e.target.value)}
              className={`mt-1 ${INPUT}`}
            />
          </div>
          <div>
            <label htmlFor={`closes-${mode}`} className="block text-sm">
              마감 시각 (선택)
            </label>
            <input
              id={`closes-${mode}`}
              type="datetime-local"
              value={closes}
              onChange={(e) => setCloses(e.target.value)}
              className={`mt-1 ${INPUT}`}
            />
          </div>
        </div>
        {windowInvalid ? (
          <p role="alert" className="text-sm text-red-700">
            마감 시각은 시작 시각보다 늦어야 합니다.
          </p>
        ) : null}
        {mode === "publish" ? (
          <label className="block text-sm">
            <input
              type="checkbox"
              className={CHECK_BOX}
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{" "}
            배포하면 이 퍼즐(v{version})은 더 이상 수정할 수 없고, 바꾸려면 새 버전을 만들어야 함을
            확인했습니다.
          </label>
        ) : (
          <p className="text-xs text-slate-600">
            퍼즐 자체는 바뀌지 않습니다. 이미 닫은 배포는 다시 열 수 없습니다.
          </p>
        )}
        {active.state && !active.state.ok ? (
          <p role="alert" className="text-sm text-red-700">
            {active.state.error}
          </p>
        ) : null}
        {active.state?.ok ? (
          <p role="status" className="text-sm text-green-800">
            {mode === "publish" ? "배포했습니다." : "학급을 추가했습니다."}
          </p>
        ) : null}
        {/* A disabled button gives no reason: say what is missing, and tie the text to the button. */}
        <p id={`why-${mode}`} className="text-xs text-slate-700">
          {selected.size === 0
            ? "학급을 하나 이상 선택해 주세요."
            : !confirmed
              ? "수정할 수 없게 된다는 확인란을 선택해 주세요."
              : windowInvalid
                ? "마감 시각을 시작 시각보다 늦게 정해 주세요."
                : "준비되었습니다."}
        </p>
        <button
          type="submit"
          aria-describedby={`why-${mode}`}
          disabled={active.pending || selected.size === 0 || !confirmed || windowInvalid}
          className={BTN_PRIMARY}
        >
          {active.pending ? "처리 중..." : mode === "publish" ? "배포" : "학급 추가"}
        </button>
      </form>
    </section>
  );
}
