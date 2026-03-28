import type { InsForgeClient } from "@/lib/insforge-client-type";
import type { ClassificationResult, EmailRow } from "@/lib/types";
import { aiModel } from "@/lib/insforge";
import { parseModelJson } from "@/lib/agent/parse-json";

const CLASSIFIER_PROMPT = `You are an email priority classifier. Given an email, return ONLY a JSON object with no markdown or explanation.

Rules for priority_score:
- 9–10: Direct reply to my sent email, urgent deadline, or message from a known VIP
- 7–8: Requires my action soon, time-sensitive, from a real person
- 5–6: Informational, from a real person, no immediate action needed
- 3–4: Automated but potentially relevant (receipts, shipping updates)
- 1–2: Newsletter, marketing, auto-subscribed list, bulk promotional

Rules for category:
- direct_reply: someone replied to an email I sent
- confirmation: order, booking, or account confirmation
- newsletter: subscribed or auto-subscribed mailing list
- marketing: promotional email from a company
- other: anything else

Rules for recommended_action:
- draft_reply: the sender clearly expects a written response — questions, direct replies to your thread, requests for approval/confirmation, deadlines, or a real person waiting on you. Use this whenever a human reply would be socially or professionally expected, even if the tone is casual.
- bulk_delete_candidate: low priority (1-4) confirmation/marketing/newsletter clutter safe to bulk remove
- unsubscribe_prompt: newsletter or marketing list with clear list-unsubscribe or mailing-list pattern
- none: FYI-only, automated receipts with no reply needed, shipping updates, or messages that need no response

Be strict: do NOT use draft_reply for newsletters, promos, or one-way notifications. DO use draft_reply when is_reply_to_sent is true and they are engaging with your prior email, or when they ask something only you can answer.

Return format:
{
  "summary": "...",
  "priority_score": 0,
  "priority_reason": "...",
  "category": "...",
  "recommended_action": "..."
}`;

export async function classifyEmail(
  client: InsForgeClient,
  input: Pick<
    EmailRow,
    "sender" | "subject" | "body_preview"
  > & { is_reply_to_sent: boolean; list_unsubscribe_url?: string | null },
): Promise<ClassificationResult> {
  const userContent = [
    `sender: ${input.sender}`,
    `subject: ${input.subject}`,
    `body_preview: ${input.body_preview ?? ""}`,
    `is_reply_to_sent: ${input.is_reply_to_sent}`,
    input.list_unsubscribe_url
      ? `list_unsubscribe_url: ${input.list_unsubscribe_url}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const completion = await client.ai.chat.completions.create({
    model: aiModel(),
    messages: [
      { role: "system", content: CLASSIFIER_PROMPT },
      { role: "user", content: userContent },
    ],
    temperature: 0.2,
    maxTokens: 500,
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("Empty classification response");

  const parsed = parseModelJson<ClassificationResult>(text);
  if (
    typeof parsed.priority_score !== "number" ||
    parsed.priority_score < 1 ||
    parsed.priority_score > 10
  ) {
    throw new Error("Invalid priority_score in model output");
  }
  return parsed;
}
