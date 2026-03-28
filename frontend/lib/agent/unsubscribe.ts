import type { InsForgeClient } from "@/lib/insforge-client-type";

const EMAIL_IN_ANGLE = /<([^>\s]+@[^>\s]+)>/;

export function parseSenderEmail(senderField: string): {
  email: string;
  name: string | null;
} {
  const m = senderField.match(EMAIL_IN_ANGLE);
  if (m) {
    const email = m[1].toLowerCase();
    const name = senderField.replace(EMAIL_IN_ANGLE, "").trim().replace(/^"|"$/g, "") || null;
    return { email, name };
  }
  const trimmed = senderField.trim();
  if (trimmed.includes("@")) return { email: trimmed.toLowerCase(), name: null };
  return { email: trimmed, name: null };
}

/** Record newsletter sender for unsubscribe prompt if not already tracked. */
export async function ensureSubscriptionRow(
  client: InsForgeClient,
  userId: string,
  senderField: string,
): Promise<void> {
  const { email, name } = parseSenderEmail(senderField);
  if (!email.includes("@")) return;

  const { data: existing } = await client.database
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("sender_email", email)
    .maybeSingle();

  if (existing) return;

  await client.database.from("subscriptions").insert({
    user_id: userId,
    sender_email: email,
    sender_name: name,
  });
}

export function needsUnsubscribePrompt(params: {
  category: string | null;
  recommended_action: string | null;
  list_unsubscribe_url: string | null;
}): boolean {
  if (params.recommended_action === "unsubscribe_prompt") return true;
  if (params.category === "newsletter" || params.category === "marketing") {
    return Boolean(params.list_unsubscribe_url);
  }
  return false;
}
