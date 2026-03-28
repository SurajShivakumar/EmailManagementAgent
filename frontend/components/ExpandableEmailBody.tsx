"use client";

import { useCallback, useMemo, useState } from "react";

type LoadState = "idle" | "loading" | "done" | "error";

/** Empty sandbox blocks scripts; popups let mailto/https open in a new window. */
const IFRAME_SANDBOX = "allow-popups allow-popups-to-escape-sandbox" as const;

function wrapHtmlForIframe(html: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>
    html,body{margin:0;padding:14px 16px;background:#0c1222;color:#e2e8f0;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:15px;line-height:1.55;word-break:break-word;-webkit-font-smoothing:antialiased;}
    a{color:#38bdf8;}
    img{max-width:100%!important;height:auto!important;}
    table{max-width:100%!important;}
    blockquote{border-left:3px solid #334155;margin:0.5em 0;padding-left:1em;color:#cbd5e1;}
    pre, code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;background:#1e293b;padding:2px 6px;border-radius:4px;}
    pre{padding:10px;overflow:auto;}
  </style></head><body>${html}</body></html>`;
}

export function ExpandableEmailBody({
  emailId,
  userId,
  className = "",
}: {
  emailId: string;
  userId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>("idle");
  const [loaded, setLoaded] = useState(false);
  const [plain, setPlain] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const iframeDoc = useMemo(
    () => (html ? wrapHtmlForIframe(html) : null),
    [html],
  );

  const load = useCallback(async () => {
    if (state === "loading") return;
    setState("loading");
    setErr(null);
    try {
      const qs = `?userId=${encodeURIComponent(userId)}`;
      const res = await fetch(`/api/emails/${emailId}/body${qs}`, {
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Could not load message");
      const p = typeof j.plain === "string" ? j.plain : j.body ?? "";
      const h = typeof j.html === "string" && j.html.trim() ? j.html : null;
      setPlain(p);
      setHtml(h);
      setLoaded(true);
      setState("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
      setState("error");
    }
  }, [emailId, userId, state]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) void load();
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        className="text-sm font-medium text-sky-400/90 hover:text-sky-300"
      >
        {open ? "Hide original" : "View original"}
      </button>

      {open && state === "loading" && (
        <p className="mt-2 text-sm text-slate-500">Loading original…</p>
      )}
      {open && err && (
        <p className="mt-2 text-sm text-red-400">{err}</p>
      )}

      {open && state === "done" && (
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-700/80 bg-slate-950/80 shadow-inner">
          {iframeDoc ? (
            <iframe
              title="Email message"
              className="h-[min(70vh,520px)] w-full border-0 bg-slate-950"
              sandbox={IFRAME_SANDBOX}
              srcDoc={iframeDoc}
            />
          ) : (
            <div className="max-h-[min(70vh,520px)] overflow-auto p-4 font-serif text-[15px] leading-relaxed tracking-normal text-slate-200">
              <pre className="whitespace-pre-wrap break-words font-sans text-[15px] leading-relaxed">
                {plain || "(No body text)"}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
