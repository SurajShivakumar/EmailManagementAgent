import type { ClassificationResult, EmailRow } from "@/lib/types";

/**
 * Google account security / sign-in notifications are one-way; users should not reply.
 * Detection is heuristic on sender + subject (and light body preview).
 */
export function isGoogleSecurityAlert(
  email: Pick<EmailRow, "sender" | "subject" | "body_preview">,
): boolean {
  const sender = (email.sender ?? "").toLowerCase();
  const subject = (email.subject ?? "").toLowerCase();
  const preview = (email.body_preview ?? "").toLowerCase();

  const googleSender =
    /@google\.com|@accounts\.google|@accountprotection\.google|noreply-google|no-reply@accounts|account-protection-noreply/i.test(
      sender,
    );

  const securitySubject =
    /security alert|sign-?in notification|new sign-?in|new device|2-?step verification|verification code|recovery (email|phone|option)|review (this )?activity|someone has your password|password (was )?changed|less secure app|app password|google account/i.test(
      subject,
    );

  const securityPreview =
    /security alert|sign-?in from a new|new device signed|2-?step verification|google account/i.test(
      preview,
    );

  if (!googleSender) return false;
  return securitySubject || securityPreview;
}

/** Clamp priority to medium (5–6) and clear reply-oriented actions for security alerts. */
export function normalizeGoogleSecurityAlertFields(
  email: Pick<EmailRow, "sender" | "subject" | "body_preview">,
  c: ClassificationResult,
): ClassificationResult {
  if (!isGoogleSecurityAlert(email)) return c;
  const score = Math.max(5, Math.min(6, c.priority_score));
  return {
    ...c,
    priority_score: score,
    recommended_action: "none",
    priority_reason: c.priority_reason?.trim()
      ? `${c.priority_reason} (Google security notice — no reply needed.)`
      : "Google security notice — no reply needed.",
  };
}
