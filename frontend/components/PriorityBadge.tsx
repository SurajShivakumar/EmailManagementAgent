"use client";

import { priorityImportanceLabel } from "@/lib/priority-label";

function tierClasses(s: number) {
  let cls =
    "inline-flex min-w-[2rem] justify-center rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums ";
  if (s >= 8) cls += "bg-red-900/80 text-red-100 ring-1 ring-red-700/50";
  else if (s >= 5) cls += "bg-amber-900/70 text-amber-100 ring-1 ring-amber-700/40";
  else cls += "bg-zinc-700/80 text-zinc-300 ring-1 ring-zinc-600/50";
  return cls;
}

export function PriorityBadge({
  score,
  compact = false,
}: {
  score: number | null;
  compact?: boolean;
}) {
  const s = score ?? 0;
  const label = priorityImportanceLabel(score);
  const cls = tierClasses(s);

  if (compact) {
    return <span className={cls}>{s}</span>;
  }

  return (
    <div className="flex flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:gap-2">
      <span className={cls}>{s}</span>
      <span className="max-w-[10rem] text-right text-xs font-medium leading-tight text-slate-400 sm:max-w-none sm:text-left">
        {label}
      </span>
    </div>
  );
}
