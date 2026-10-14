"use client";

import { useState } from "react";
import type { ProvisionedStudentAccount } from "@/features/accounts/domain";

type Props = {
  credential: ProvisionedStudentAccount;
};

export function CredentialCard({ credential }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = `아이디: ${credential.username}\n임시 비밀번호: ${credential.temporaryPassword}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-4" aria-live="polite">
      <h2 className="text-base font-semibold">학생 계정이 생성되었습니다</h2>
      <p className="mt-1 text-sm text-amber-800">
        임시 비밀번호는 지금 한 번만 표시됩니다. 이 화면을 벗어나면 다시 확인할 수 없습니다.
      </p>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="font-medium">아이디</dt>
        <dd className="font-mono">{credential.username}</dd>
        <dt className="font-medium">임시 비밀번호</dt>
        <dd className="font-mono">{credential.temporaryPassword}</dd>
      </dl>

      <button
        type="button"
        onClick={copy}
        className="mt-4 rounded-md bg-slate-900 px-3 py-2 text-sm text-white"
      >
        {copied ? "복사됨" : "복사하기"}
      </button>
    </section>
  );
}
