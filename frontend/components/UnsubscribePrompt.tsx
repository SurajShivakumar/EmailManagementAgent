"use client";

import { useState } from "react";

type Sub = {
  id: string;
  sender_email: string;
  sender_name: string | null;
  unsubscribed: boolean;
};

export function UnsubscribePrompt({
  subscriptions,
  onUpdated,
}: {
  subscriptions: Sub[];
  onUpdated: () => void;
}) {
  const pending = subscriptions.filter((s) => !s.unsubscribed);
  const [busy, setBusy] = useState(false);
  const [keepIds, setKeepIds] = useState<Set<string>>(() => new Set());
  const [err, setErr] = useState<string | null>(null);

  if (!pending.length) return null;

  async function markDone(id: string) {
    const res = await fetch("/api/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "mark_unsubscribed",
        subscriptionId: id,
      }),
  function toggleKeep(id: string) {
    setKeepIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulk(action: "all" | "all_except") {
    if (!userId) return;
    const msg =
      action === "all"
        ? `Unsubscribe from all ${pending.length} mailing lists? This can take a minute.`
        : `Unsubscribe from every list except the ${keepIds.size} you marked to keep?`;
    if (!window.confirm(msg)) return;

    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/subscriptions/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "all_except"
            ? { keepSubscriptionIds: [...keepIds] }
            : {}),
          userId,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Bulk unsubscribe failed");
      onUpdated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Bulk unsubscribe failed");
    } finally {
      setBusy(false);
    }
  }

  async function markDone(id: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_unsubscribed",
          subscriptionId: id,
          ...(userId ? { userId } : {}),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Update failed");
      }
      onUpdated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function oneUnsubscribe(id: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/subscriptions/unsubscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: id, ...(userId ? { userId } : {}) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Unsubscribe failed");
      onUpdated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unsubscribe failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-violet-900/45 bg-violet-950/25 p-4 ring-1 ring-violet-900/25">
      <h2 className="text-sm font-semibold text-violet-100">
        Subscription interceptor
      </h2>
      <p className="mt-1 text-xs text-violet-200/75">
        New lists are tracked here. Use bulk actions or handle one sender at a time.
      </p>
      {err && <p className="mt-2 text-xs text-red-400">{err}</p>}

      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => bulk("all")}
          className="rounded-lg bg-violet-800/70 px-3 py-2 text-xs font-medium text-white hover:bg-violet-700/70 disabled:opacity-50"
        >
          Unsubscribe from all
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => bulk("all_except")}
          className="rounded-lg border border-violet-700/50 px-3 py-2 text-xs font-medium text-violet-100 hover:bg-violet-950/50 disabled:opacity-50"
        >
          Unsubscribe all except lists I keep below
        </button>
      </div>

      <p className="mt-3 text-[11px] text-violet-200/60">
        Check &ldquo;Keep&rdquo; for senders you want to stay subscribed to, then use
        the second button.
      </p>

      <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
        {pending.map((s) => (
          <li
            key={s.id}
            className="rounded-lg border border-violet-800/35 bg-violet-950/30 px-2 py-2"
          >
            <div className="text-xs text-violet-100">
              <p>
                You were auto-subscribed to{" "}
                <strong>{s.sender_name || s.sender_email}</strong>. Unsubscribe?
              </p>
            </div>
            <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-violet-200/90">
              <input
                type="checkbox"
                checked={keepIds.has(s.id)}
                onChange={() => toggleKeep(s.id)}
                className="mt-0.5 rounded border-violet-600"
              />
              <span className="min-w-0 flex-1">
                Keep receiving this list (exempt from &ldquo;all except&rdquo;)
              </span>
            </label>
            <div className="mt-2 flex flex-wrap gap-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => oneUnsubscribe(s.id)}
                className="rounded bg-violet-700/50 px-2 py-1 text-[10px] text-white hover:bg-violet-600/50 disabled:opacity-50"
              >
                Unsubscribe this one
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => markDone(s.id)}
                className="rounded border border-violet-700/40 px-2 py-1 text-[10px] text-violet-200 hover:bg-violet-950/40 disabled:opacity-50"
              >
                I handled it
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
