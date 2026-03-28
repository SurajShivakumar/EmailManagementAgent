"use client";

export function PriorityBadge({ score }: { score: number | null }) {
  const s = score ?? 0;
  let cls =
    "inline-flex min-w-[2rem] justify-center rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums ";
  if (s >= 8) cls += "bg-red-900/80 text-red-100 ring-1 ring-red-700/50";
  else if (s >= 5) cls += "bg-amber-900/70 text-amber-100 ring-1 ring-amber-700/40";
  else cls += "bg-zinc-700/80 text-zinc-200 ring-1 ring-zinc-600/50";

  return <span className={cls}>{s}</span>;
}
