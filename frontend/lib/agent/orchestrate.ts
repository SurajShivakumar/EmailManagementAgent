import type { InsForgeClient } from "@/lib/insforge-client-type";
import { classifyEmail } from "@/lib/agent/classify";
import { draftReply } from "@/lib/agent/draft";
import { ensureSubscriptionRow } from "@/lib/agent/unsubscribe";
import type { ClassificationResult, EmailRow } from "@/lib/types";

export async function processEmailRow(
  client: InsForgeClient,
  email: EmailRow,
  opts: { is_reply_to_sent: boolean },
): Promise<{ classification: ClassificationResult }> {
  const classification = await classifyEmail(client, {
    sender: email.sender,
    subject: email.subject,
    body_preview: email.body_preview,
    is_reply_to_sent: opts.is_reply_to_sent,
    list_unsubscribe_url: email.list_unsubscribe_url,
  });

  const update: Record<string, unknown> = {
    summary: classification.summary,
    priority_score: classification.priority_score,
    priority_reason: classification.priority_reason,
    category: classification.category,
    recommended_action: classification.recommended_action,
  };

  let draftText: string | null = null;
  if (
    classification.priority_score >= 7 &&
    classification.recommended_action === "draft_reply"
  ) {
    draftText = await draftReply(client, {
      sender: email.sender,
      subject: email.subject,
      body_preview: email.body_preview,
      summary: classification.summary,
    });
    update.draft_reply = draftText;
  }

  const { error } = await client.database
    .from("emails")
    .update(update)
    .eq("id", email.id);

  if (error) throw error;

  if (classification.category === "newsletter") {
    await ensureSubscriptionRow(client, email.user_id, email.sender);
  }

  return { classification };
}
