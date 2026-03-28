"use client";

import type { EmailRow } from "@/lib/types";
import { PriorityBadge } from "@/components/PriorityBadge";
import { DraftReply } from "@/components/DraftReply";

export function EmailCard({
  email,
  onClassify,
  onSendReply,
}: {
  email: EmailRow;
  onClassify: (id: string) => void;
  onSendReply?: (emailId: string) => Promise<void>;
}) {
  const showDraft =
    email.draft_reply &&
    (email.priority_score ?? 0) >= 7;

  return (
    <article
      className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{email.sender}</p>
          <p className="truncate text-xs text-[var(--muted)]">{email.subject}</p>
        </div>
        <PriorityBadge score={email.priority_score} />
      </div>
      {email.summary && (
        <p className="mt-2 text-sm text-slate-200">{email.summary}</p>
      )}
      {email.priority_reason && (
        <p className="mt-1 text-xs text-slate-500">{email.priority_reason}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
        {email.category && (
          <span className="rounded bg-slate-800/80 px-2 py-0.5">{email.category}</span>
        )}
        {email.recommended_action && (
          <span className="rounded bg-slate-800/80 px-2 py-0.5">
            {email.recommended_action}
          </span>
        )}
      </div>
      {showDraft && (
        <DraftReply
          text={email.draft_reply!}
          onSend={onSendReply ? () => onSendReply(email.id) : undefined}
        />
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onClassify(email.id)}
          className="rounded-md border border-slate-600 bg-slate-800/50 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700/50"
        >
          Re-run AI
        </button>
        {email.list_unsubscribe_url && (
          <a
            href={email.list_unsubscribe_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-violet-800/50 px-2 py-1 text-xs text-violet-200 hover:bg-violet-950/40"
          >
            List-Unsubscribe
          </a>
        )}
      </div>
    </article>
  );
}
