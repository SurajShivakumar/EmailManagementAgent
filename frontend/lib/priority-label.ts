/** Human-readable importance next to the 1–10 score. */
export function priorityImportanceLabel(score: number | null | undefined): string {
  const s = score ?? 0;
  if (s <= 2) return "Not important";
  if (s <= 4) return "Low importance";
  if (s <= 6) return "Moderate";
  if (s <= 8) return "Important";
  return "Urgent";
}
