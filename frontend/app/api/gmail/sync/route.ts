import { NextRequest, NextResponse } from "next/server";
import { createServerInsForge } from "@/lib/insforge";
import { resolveUserId } from "@/lib/default-user";
import { fetchInboxBatch, getGmailForUser } from "@/lib/gmail";
import { processEmailRow } from "@/lib/agent/orchestrate";
import type { EmailRow } from "@/lib/types";

/** Pull recent inbox messages into InsForge `emails`, then classify each new row. */
export async function POST(req: NextRequest) {
  try {
    const client = createServerInsForge();
    const body = (await req.json().catch(() => ({}))) as {
      userId?: string;
      maxResults?: number;
    };
    const userId = await resolveUserId(client, body.userId ?? null);
    const maxResults = Math.min(body.maxResults ?? 25, 50);

    const gmail = await getGmailForUser(client, userId);
    if (!gmail) {
      return NextResponse.json(
        { error: "Gmail not connected. Visit /api/auth/gmail" },
        { status: 400 },
      );
    }

    const batch = await fetchInboxBatch(gmail, maxResults);
    let inserted = 0;
    let processed = 0;

    for (const m of batch) {
      const { data: existing } = await client.database
        .from("emails")
        .select("id")
        .eq("gmail_id", m.gmailId)
        .maybeSingle();

      if (existing) continue;

      const { data: row, error: insErr } = await client.database
        .from("emails")
        .insert([
          {
            user_id: userId,
            gmail_id: m.gmailId,
            sender: m.sender,
            subject: m.subject,
            body_preview: m.bodyPreview,
            list_unsubscribe_url: m.listUnsubscribe,
            received_at: m.internalDate ?? new Date().toISOString(),
            status: "pending",
          },
        ])
        .select("*")
        .single();

      if (insErr) throw insErr;
      inserted += 1;
      if (row) {
        await processEmailRow(client, row as EmailRow, {
          is_reply_to_sent: m.isReplyToSent,
        });
        processed += 1;
      }
    }

    return NextResponse.json({ inserted, classified: processed });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
