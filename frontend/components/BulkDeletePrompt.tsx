"use client";

type Group = { category: string; count: number; ids: string[] };

const LABELS: Record<string, string> = {
  confirmation: "confirmation",
  newsletter: "newsletter",
  marketing: "marketing",
  other: "other",
};

export function BulkDeletePrompt({
  groups,
  onDeleted,
  userId,
}: {
  groups: Group[];
  onDeleted: () => void;
  userId?: string | null;
}) {
  if (!groups.length) return null;

  async function deleteCategory(category: string) {
    const res = await fetch("/api/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete",
        category,
        ...(userId ? { userId } : {}),
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Delete failed");
      return;
    }
    onDeleted();
  }

  return (
    <div className="mb-6 space-y-2 rounded-xl border border-amber-900/40 bg-amber-950/25 p-4">
      <h2 className="text-sm font-semibold text-amber-100">Bulk cleanup</h2>
      <p className="text-xs text-amber-200/70">
        Low-priority messages grouped by category (3+). Delete all in a group.
      </p>
      <ul className="flex flex-wrap gap-2">
        {groups.map((g) => (
          <li key={g.category}>
            <button
              type="button"
              onClick={() => deleteCategory(g.category)}
              className="rounded-lg border border-amber-800/50 bg-amber-950/40 px-3 py-2 text-left text-sm text-amber-50 hover:bg-amber-900/40"
            >
              You have {g.count}{" "}
              <span className="font-medium">
                {LABELS[g.category] ?? g.category}
              </span>{" "}
              emails. Delete all?
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
