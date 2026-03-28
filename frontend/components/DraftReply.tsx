"use client";

import { useState } from "react";

export function DraftReply({ text }: { text: string }) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <button
            type="button"
            onClick={copy}
            className="rounded-md bg-emerald-800/60 px-3 py-1.5 text-sm text-white hover:bg-emerald-700/60"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
