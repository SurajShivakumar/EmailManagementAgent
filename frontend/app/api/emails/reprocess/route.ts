import { NextRequest, NextResponse } from "next/server";
import { createServerInsForge } from "@/lib/insforge";
import {
  requireGmailBrowserSession,
  resolveSessionUserId,
} from "@/lib/session-user";
import { processEmailRow } from "@/lib/agent/orchestrate";
import { fetchGoogleUserIdentity } from "@/lib/gmail";
import type { EmailRow } from "@/lib/types";

/** Re-run classification + drafts for all non-deleted emails for the user. */
export async function POST(req: NextRequest) {
  try {
    const denied = requireGmailBrowserSession(req);
    if (denied) return denied;

    const body = (await req.json().catch(() => ({}))) as { userId?: string };
    const client = createServerInsForge();
    const userId = await resolveSessionUserId(client, req, body.userId ?? null);
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const identity = await fetchGoogleUserIdentity(client, userId);

    const { data: rows, error } = await client.database
      .from("emails")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "deleted");

    if (error) throw error;

    const list = (rows ?? []) as EmailRow[];
    let processed = 0;
    for (const row of list) {
      try {
        await processEmailRow(client, row, {
          is_reply_to_sent: false,
          googleProfile: identity,
        });
        processed += 1;
      } catch {
        /* continue other rows */
      }
    }

    return NextResponse.json({ ok: true, processed, total: list.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
