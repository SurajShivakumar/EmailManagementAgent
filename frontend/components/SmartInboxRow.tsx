"use client";

import type { EmailRow } from "@/lib/types";
import { PriorityBadge } from "@/components/PriorityBadge";
import { DraftReplyPanel } from "@/components/DraftReplyPanel";
import { ExpandableEmailBody } from "@/components/ExpandableEmailBody";

export function SmartInboxRow({
  email,
  userId,
  gmailConnected,
}: {
  email: EmailRow;
  userId: string;
  gmailConnected: boolean;
}) {
  const showDraft = Boolean(email.draft_reply);

  return (
    <article className="overflow-hidden rounded-xl border border-slate-700/90 bg-slate-950/50">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-medium text-white">{email.sender}</p>
          <p className="truncate text-xs text-slate-400">{email.subject}</p>
          {email.summary && (
            <p className="line-clamp-2 text-sm text-slate-300">{email.summary}</p>
          )}
          {email.priority_reason && (
            <p className="text-xs text-slate-500">{email.priority_reason}</p>
          )}
        </div>
        <div className="shrink-0 pt-0.5">
          <PriorityBadge score={email.priority_score} compact />
        </div>
      </div>

      <div className="border-t border-slate-800/80 px-4 pb-3 pt-1">
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
        <div className="border-t border-slate-800/80 px-4 pb-3">
          <DraftReplyPanel
            emailId={email.id}
            userId={userId}
            initialText={email.draft_reply}
            gmailConnected={gmailConnected}
          />
        </div>
      )}
    </article>
  );
}
