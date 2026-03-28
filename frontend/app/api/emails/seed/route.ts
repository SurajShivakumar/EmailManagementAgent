import { NextRequest, NextResponse } from "next/server";
import { createServerInsForge } from "@/lib/insforge";
import { resolveUserId } from "@/lib/default-user";
import { processEmailRow } from "@/lib/agent/orchestrate";
import type { EmailRow } from "@/lib/types";

/** Demo seed: inserts sample emails and runs the agent pipeline. */
export async function POST(req: NextRequest) {
  try {
    const client = createServerInsForge();
    const body = (await req.json().catch(() => ({}))) as { userId?: string };
    const userId = await resolveUserId(client, null);

    const samples = [
      {
        sender: "Jane Client <jane@client.com>",
        subject: "Re: Proposal — need your answer by Monday",
        body_preview:
          "Hi — following up on the proposal you sent. Can you confirm pricing by Monday?",
        gmail_id: `seed-reply-${crypto.randomUUID()}`,
        is_reply_to_sent: true,
        list_unsubscribe_url: null as string | null,
      },
      {
        sender: "Accounts Payable <ap@vendor.com>",
        subject: "Invoice #9921 due",
        body_preview:
          "Please find invoice 9921 attached. Amount $4,200 due in 14 days.",
        gmail_id: `seed-invoice-${crypto.randomUUID()}`,
        is_reply_to_sent: false,
        list_unsubscribe_url: null,
      },
      {
        sender: "ShipCo <noreply@shipco.com>",
        subject: "Your order has shipped",
        body_preview:
          "Tracking: 1Z999. Estimated delivery Friday.",
        gmail_id: `seed-ship-${crypto.randomUUID()}`,
        is_reply_to_sent: false,
        list_unsubscribe_url: null,
      },
      {
        sender: "Weekly Digest <digest@newsletters.io>",
        subject: "This week in tech",
        body_preview: "Top 10 stories… Unsubscribe: https://newsletters.io/u",
        gmail_id: `seed-news-${crypto.randomUUID()}`,
        is_reply_to_sent: false,
        list_unsubscribe_url: "https://newsletters.io/unsub",
      },
      {
        sender: "BigSale <promo@retailer.com>",
        subject: "48 hours only: 70% off",
        body_preview: "Shop our sale. List-Unsubscribe: <mailto:unsub@retailer.com>",
        gmail_id: `seed-mkt-${crypto.randomUUID()}`,
        is_reply_to_sent: false,
        list_unsubscribe_url: "mailto:unsub@retailer.com",
      },
    ];

    const createdIds: string[] = [];

    for (const s of samples) {
      const { data: inserted, error: insErr } = await client.database
        .from("emails")
        .insert([
          {
            user_id: userId,
            gmail_id: s.gmail_id,
            sender: s.sender,
            subject: s.subject,
            body_preview: s.body_preview,
            list_unsubscribe_url: s.list_unsubscribe_url,
            received_at: new Date().toISOString(),
            status: "pending",
          },
        ])
        .select("id")
        .single();

      if (insErr) throw insErr;
      if (inserted?.id) {
        createdIds.push(inserted.id);
        const { data: row } = await client.database
          .from("emails")
          .select("*")
          .eq("id", inserted.id)
          .single();
        if (row) {
          await processEmailRow(client, row as EmailRow, {
            is_reply_to_sent: s.is_reply_to_sent,
          });
        }
      }
    }

    return NextResponse.json({ ok: true, createdIds });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
