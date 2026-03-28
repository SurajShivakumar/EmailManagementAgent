"use client";

import { useEffect, useState } from "react";

export function DraftReplyPanel({
  emailId,
  userId,
  initialText,
  gmailConnected,
  onSent,
}: {
  emailId: string;
  userId: string;
  initialText: string;
  gmailConnected: boolean;
  onSent?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState(initialText);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentOk, setSentOk] = useState(false);

  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function saveDraft() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/emails/update-draft", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId, draft_reply: text, userId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Save failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function sendReply() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/gmail/send-reply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId, body: text, userId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Send failed");
      setSentOk(true);
      onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
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
        <div className="space-y-2 border-t border-emerald-900/40 px-3 py-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="w-full resize-y rounded-md border border-emerald-900/40 bg-slate-950/80 px-3 py-2 text-sm text-emerald-50 placeholder:text-slate-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-700"
            placeholder="Edit your reply before copying or sending…"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          {sentOk && (
            <p className="text-xs text-emerald-400/90">Reply sent from Gmail.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copy}
              className="rounded-md bg-emerald-800/60 px-3 py-1.5 text-sm text-white hover:bg-emerald-700/60"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={saveDraft}
              disabled={saving}
              className="rounded-md border border-emerald-800/50 px-3 py-1.5 text-sm text-emerald-100 hover:bg-emerald-950/50 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
            {gmailConnected ? (
              <button
                type="button"
                onClick={sendReply}
                disabled={sending || sentOk || !text.trim()}
                className="rounded-md bg-blue-700/80 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600/80 disabled:opacity-50"
              >
                {sending ? "Sending…" : sentOk ? "Sent" : "Send via Gmail"}
              </button>
            ) : (
              <span className="self-center text-xs text-slate-500">
                Connect Gmail to send from here.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
