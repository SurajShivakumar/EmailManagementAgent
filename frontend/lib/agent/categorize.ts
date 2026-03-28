import type { EmailRow } from "@/lib/types";

export type BulkGroupPreview = {
  id: string;
  subject: string;
  sender: string;
};

/** Groups low-priority pending emails by category for bulk-delete UI (no "other" bucket). */
export function groupBulkDeleteCandidates(
  emails: EmailRow[],
  minPerGroup = 3,
): {
  category: string;
  count: number;
  ids: string[];
  items: BulkGroupPreview[];
}[] {
  const allowed = new Set(["confirmation", "newsletter", "marketing"]);
  const eligible = emails.filter(
    (e) =>
      e.status !== "deleted" &&
      (e.priority_score ?? 0) <= 4 &&
      allowed.has(e.category ?? ""),
  );
  const map = new Map<string, EmailRow[]>();
  for (const e of eligible) {
    const cat = e.category as string;
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(e);
  }
  return [...map.entries()]
    .filter(([, rows]) => rows.length >= minPerGroup)
    .map(([category, rows]) => ({
      category,
      count: rows.length,
      ids: rows.map((r) => r.id),
      items: rows.map((r) => ({
        id: r.id,
        subject: (r.subject || "(no subject)").slice(0, 120),
        sender: r.sender.replace(/<[^>]+>/g, "").trim() || r.sender,
      })),
    }));
}
