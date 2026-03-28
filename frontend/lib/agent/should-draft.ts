import type { ClassificationResult, EmailRow } from "@/lib/types";

/** Heuristic: message text suggests someone expects a human reply. */
const LIKELY_NEEDS_REPLY =
  /\?|(please (advise|confirm|let me know|reply|respond|review))|(need (your |a )?(input|answer|approval|response|help))|(when can you|could you (please )?(confirm|send|review|get back))|((looking forward to|awaiting) (your |a )?response)/i;

function isLowValueNoise(c: ClassificationResult): boolean {
  return (
    (c.category === "newsletter" || c.category === "marketing") &&
    c.priority_score <= 4
  );
}

/**
 * Whether to generate an AI draft reply — combines model signal + thread context + heuristics.
 */
export function shouldGenerateDraftReply(
  c: ClassificationResult,
  email: Pick<EmailRow, "body_preview" | "subject">,
): boolean {
  if (isLowValueNoise(c)) return false;
  if (c.priority_score >= 7) return true;
  if (c.recommended_action === "bulk_delete_candidate" && c.priority_score <= 5) {
    return false;
  }

  if (c.recommended_action === "draft_reply") return true;

  if (c.category === "direct_reply" && c.priority_score >= 6) return true;

  if (c.priority_score >= 9) return true;

  if (c.priority_score >= 8 && c.recommended_action !== "bulk_delete_candidate") {
    return true;
  }

  const blob = `${email.subject ?? ""}\n${email.body_preview ?? ""}`;
  if (c.priority_score >= 6 && LIKELY_NEEDS_REPLY.test(blob)) return true;

  if (
    c.priority_score >= 5 &&
    c.category === "other" &&
    /\?/.test(blob) &&
    !/(unsubscribe|newsletter|sale|%\s*off)/i.test(blob)
  ) {
    return true;
  }

  return false;
}

/** Use stored row fields after classification (same rules). */
export function shouldGenerateDraftReplyFromRow(
  email: EmailRow,
): boolean {
  const score = email.priority_score ?? 0;
  const c: ClassificationResult = {
    summary: email.summary ?? "",
    priority_score: score,
    priority_reason: email.priority_reason ?? "",
    category: (email.category as ClassificationResult["category"]) ?? "other",
    recommended_action:
      (email.recommended_action as ClassificationResult["recommended_action"]) ??
      "none",
  };
  return shouldGenerateDraftReply(c, email);
}
