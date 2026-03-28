"use client";

import { useState } from "react";

export function DraftReply({
  text,
  onSend,
}: {
  text: string;
  onSend?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function sendReply() {
    if (!onSend || sending) return;
    setSending(true);
    try {
      await onSend();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-emerald-900/50 bg-emerald-950/20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-emerald-200/90"
      >
        Draft reply
        <span className="text-emerald-400/70">{open ? "▼" : "▶"}</span>
      </button>
      {open && (
        <div className="border-t border-emerald-900/40 px-3 py-2">
          <pre className="mb-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm text-emerald-100/90">
            {text}
          </pre>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copy}
              className="rounded-md bg-emerald-800/60 px-3 py-1.5 text-sm text-white hover:bg-emerald-700/60"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            {onSend && (
              <button
                type="button"
                onClick={sendReply}
                disabled={sending}
                className="rounded-md bg-blue-700/70 px-3 py-1.5 text-sm text-white hover:bg-blue-600/70 disabled:opacity-60"
              >
                {sending ? "Sending..." : "Send reply"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
