import type { EmailRow } from "@/lib/types";

/** Groups low-priority pending emails by category for bulk-delete UI. */
export function groupBulkDeleteCandidates(
  emails: EmailRow[],
  minPerGroup = 3,
): { category: string; count: number; ids: string[] }[] {
  const eligible = emails.filter(
    (e) =>
      e.status !== "deleted" &&
      (e.priority_score ?? 0) <= 4 &&
      ["confirmation", "newsletter", "marketing", "other"].includes(
        e.category ?? "",
      ),
  );
  const map = new Map<string, string[]>();
  for (const e of eligible) {
    const cat = e.category || "other";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(e.id);
  }
  return [...map.entries()]
    .filter(([, ids]) => ids.length >= minPerGroup)
    .map(([category, ids]) => ({ category, count: ids.length, ids }));
}
