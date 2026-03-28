import type { InsForgeClient } from "@/lib/insforge-client-type";
import {
  getGmailForUser,
  parseMailtoUnsubscribe,
  senderFieldContainsEmail,
  tryHttpListUnsubscribe,
  sendMailtoUnsubscribe,
} from "@/lib/gmail";
import type { EmailRow } from "@/lib/types";

type SubRow = {
  id: string;
  user_id: string;
  sender_email: string;
  sender_name: string | null;
  unsubscribed: boolean;
};

export type AutoUnsubscribeResult =
  | { ok: true; already?: boolean; detail?: Record<string, unknown> }
  | { ok: false; status: number; error: string; detail?: Record<string, unknown> };

/** Run list-unsubscribe for one subscription row; marks unsubscribed in DB on success. */
export async function executeSubscriptionAutoUnsubscribe(
  client: InsForgeClient,
  userId: string,
  subscriptionId: string,
): Promise<AutoUnsubscribeResult> {
  const { data: sub, error: subErr } = await client.database
    .from("subscriptions")
    .select("*")
    .eq("id", subscriptionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (subErr) {
    return { ok: false, status: 500, error: subErr.message };
  }
  if (!sub) {
    return { ok: false, status: 404, error: "Subscription not found" };
  }

  const s = sub as SubRow;
  if (s.unsubscribed) {
    return { ok: true, already: true };
  }

  const { data: emails, error: emErr } = await client.database
    .from("emails")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "deleted")
    .not("list_unsubscribe_url", "is", null)
    .order("received_at", { ascending: false, nullsFirst: false })
    .limit(80);

  if (emErr) {
    return { ok: false, status: 500, error: emErr.message };
  }

  const match = ((emails ?? []) as EmailRow[]).find((e) =>
    senderFieldContainsEmail(e.sender, s.sender_email),
  );
  const url = match?.list_unsubscribe_url?.trim();
  if (!url) {
    return {
      ok: false,
      status: 422,
      error:
        "No List-Unsubscribe link found for this sender in synced messages. Sync again or open a recent email in Gmail.",
    };
  }

  const gmail = await getGmailForUser(client, userId);
  if (!gmail) {
    return { ok: false, status: 400, error: "Gmail not connected" };
  }

  let detail: Record<string, unknown> = {};

  if (url.toLowerCase().startsWith("mailto:")) {
    const parsed = parseMailtoUnsubscribe(url);
    if (!parsed) {
      return {
        ok: false,
        status: 422,
        error: "Could not parse mailto unsubscribe link",
      };
    }
    const sent = await sendMailtoUnsubscribe(gmail, parsed);
    detail = { via: "mailto", gmailMessageId: sent.id };
  } else {
    const res = await tryHttpListUnsubscribe(url);
    detail = {
      via: "http",
      method: res.method,
      status: res.status,
      ok: res.ok,
      error: res.error,
    };
    if (!res.ok) {
      return {
        ok: false,
        status: 502,
        error:
          res.error ??
          `Unsubscribe request failed (${res.status ?? "unknown"}). Try the link manually.`,
        detail,
      };
    }
  }

  const { error: upErr } = await client.database
    .from("subscriptions")
    .update({
      unsubscribed: true,
      unsubscribed_at: new Date().toISOString(),
    })
    .eq("id", s.id)
    .eq("user_id", userId);

  if (upErr) {
    return { ok: false, status: 500, error: upErr.message };
  }

  return { ok: true, detail };
}
