"use client";

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
  if (!pending.length) return null;

  async function markDone(id: string) {
    const res = await fetch("/api/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "mark_unsubscribed",
        subscriptionId: id,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Update failed");
      return;
    }
    onUpdated();
  }

  return (
    <div className="mb-6 space-y-2 rounded-xl border border-violet-900/40 bg-violet-950/20 p-4">
      <h2 className="text-sm font-semibold text-violet-100">Newsletter senders</h2>
      <p className="text-xs text-violet-200/70">
        Unsubscribe in your mail client, then mark done here. Or open the
        list-unsubscribe link from the message headers when available.
      </p>
      <ul className="space-y-2">
        {pending.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-800/40 bg-violet-950/30 px-3 py-2"
          >
            <span className="text-sm text-violet-100">
              Unsubscribe from{" "}
              <strong>{s.sender_name || s.sender_email}</strong>?
            </span>
            <button
              type="button"
              onClick={() => markDone(s.id)}
              className="rounded-md bg-violet-800/60 px-2 py-1 text-xs text-white hover:bg-violet-700/60"
            >
              Mark unsubscribed
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
