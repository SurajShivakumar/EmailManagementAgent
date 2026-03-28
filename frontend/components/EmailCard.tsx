"use client";

import type { EmailRow } from "@/lib/types";
import { PriorityBadge } from "@/components/PriorityBadge";
import { DraftReplyPanel } from "@/components/DraftReplyPanel";
import { ExpandableEmailBody } from "@/components/ExpandableEmailBody";

export function EmailCard({
  email,
  userId,
  gmailConnected,
  onClassify,
  variant = "default",
}: {
  email: EmailRow;
  userId: string;
  gmailConnected: boolean;
  onClassify?: (id: string) => void;
  /** Recent inbox: minimal row (no category/action tags, no Re-run AI). */
  variant?: "default" | "recent";
}) {
  const showDraft = Boolean(email.draft_reply);

  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
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
      {variant === "default" && (
        <>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
            {email.category && (
              <span className="rounded bg-slate-800/80 px-2 py-0.5">
                {email.category}
              </span>
            )}
            {email.recommended_action && (
              <span className="rounded bg-slate-800/80 px-2 py-0.5">
                {email.recommended_action}
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {onClassify && (
              <button
                type="button"
                onClick={() => onClassify(email.id)}
                className="rounded-md border border-slate-600 bg-slate-800/50 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700/50"
              >
                Re-run AI
              </button>
            )}
          </div>
        </>
      )}
      <div className="mt-3">
        <ExpandableEmailBody emailId={email.id} userId={userId} />
        {email.list_unsubscribe_url && (
          <a
            href={email.list_unsubscribe_url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs text-violet-300/90 underline hover:text-violet-200"
          >
            List-Unsubscribe
          </a>
        )}
      </div>
      {showDraft && email.draft_reply && (
        <DraftReplyPanel
          emailId={email.id}
          userId={userId}
          initialText={email.draft_reply}
          gmailConnected={gmailConnected}
        />
      )}
    </article>
  );
}
