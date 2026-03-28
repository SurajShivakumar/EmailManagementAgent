"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Group = {
  category: string;
  count: number;
  ids: string[];
  items: { id: string; subject: string; sender: string }[];
};

const LABELS: Record<string, string> = {
  confirmation: "confirmation",
  newsletter: "newsletter",
  marketing: "marketing",
};

const storageKey = (userId: string) => `bulk-dismiss:${userId}`;

export function BulkDeletePrompt({
  groups,
  onDeleted,
}: {
  groups: Group[];
  onDeleted: () => void;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    try {
      const raw = sessionStorage.getItem(storageKey(userId));
      if (raw) setDismissed(new Set(JSON.parse(raw) as string[]));
    } catch {
      setDismissed(new Set());
    }
  }, [userId]);

  const persistDismissed = useCallback(
    (next: Set<string>) => {
      setDismissed(next);
      if (userId) {
        try {
          sessionStorage.setItem(storageKey(userId), JSON.stringify([...next]));
        } catch {
          /* ignore */
        }
      }
    },
    [userId],
  );

  const visible = useMemo(
    () => groups.filter((g) => !dismissed.has(g.category)),
    [groups, dismissed],
  );

  if (!visible.length) return null;

  async function deleteCategory(category: string) {
    const res = await fetch("/api/bulk", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete",
        category,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Delete failed");
      return;
    }
    persistDismissed(new Set([...dismissed, category]));
    onDeleted();
  }

  function dismissCategory(category: string) {
    persistDismissed(new Set([...dismissed, category]));
  }

  return (
    <div
      role="region"
      aria-label="Bulk cleanup suggestions"
      className="mb-6 space-y-3 rounded-xl border border-amber-800/50 bg-amber-950/35 p-4 ring-1 ring-amber-900/30"
    >
      <h2 className="text-sm font-semibold text-amber-50">Bulk cleanup</h2>
      <p className="text-xs text-amber-200/75">
        Three or more low-priority messages in the same category. Expand each group
        to see which messages are included.
      </p>
      <ul className="space-y-2">
        {visible.map((g) => (
          <li
            key={g.category}
            className="rounded-lg border border-amber-800/40 bg-amber-950/40 p-3"
          >
            <p className="text-sm text-amber-50">
              You have{" "}
              <strong className="text-amber-100">{g.count}</strong>{" "}
              <span className="font-medium">
                {LABELS[g.category] ?? g.category}
              </span>{" "}
              emails. Delete all?
            </p>

            <details className="mt-2 rounded-md border border-amber-900/40 bg-amber-950/50">
              <summary className="cursor-pointer select-none px-2 py-1.5 text-xs font-medium text-amber-200/90 hover:bg-amber-900/20">
                Show emails in this group ({g.count})
              </summary>
              <ul className="max-h-48 space-y-1 overflow-y-auto border-t border-amber-900/30 p-2 text-xs text-amber-100/90">
                {g.items.map((it) => (
                  <li
                    key={it.id}
                    className="rounded border border-amber-900/25 bg-black/20 px-2 py-1.5"
                  >
                    <p className="font-medium text-amber-50">{it.subject}</p>
                    <p className="text-[11px] text-amber-200/70">{it.sender}</p>
                  </li>
                ))}
              </ul>
            </details>

            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => deleteCategory(g.category)}
                className="rounded-lg bg-amber-800/70 px-3 py-1.5 text-sm font-medium text-amber-50 hover:bg-amber-700/70"
              >
                Delete all
              </button>
              <button
                type="button"
                onClick={() => dismissCategory(g.category)}
                className="rounded-lg border border-amber-800/60 px-3 py-1.5 text-sm text-amber-200/90 hover:bg-amber-950/60"
              >
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
