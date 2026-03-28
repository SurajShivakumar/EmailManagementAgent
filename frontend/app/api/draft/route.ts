import { NextRequest, NextResponse } from "next/server";
import { createServerInsForge } from "@/lib/insforge";
import { draftReply } from "@/lib/agent/draft";
import { shouldGenerateDraftReplyFromRow } from "@/lib/agent/should-draft";
import { fetchGoogleUserIdentity } from "@/lib/gmail";
import {
  requireGmailBrowserSession,
  resolveSessionUserId,
} from "@/lib/session-user";
import type { EmailRow } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const denied = requireGmailBrowserSession(req);
    if (denied) return denied;

    const body = (await req.json()) as { emailId?: string; userId?: string };
    if (!body.emailId) {
      return NextResponse.json({ error: "emailId required" }, { status: 400 });
    }

    const client = createServerInsForge();
    const sessionUserId = await resolveSessionUserId(
      client,
      req,
      body.userId ?? null,
    );
    if (!sessionUserId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { data: email, error } = await client.database
      .from("emails")
      .select("*")
      .eq("id", body.emailId)
      .eq("user_id", sessionUserId)
      .single();

    if (error || !email) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    const row = email as EmailRow;
    if (row.user_id !== sessionUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!shouldGenerateDraftReplyFromRow(row)) {
      return NextResponse.json(
        {
          error:
            "This message is not set up for an AI reply (e.g. Google security notices, newsletters, or low-priority mail). Re-run classification if needed.",
        },
        { status: 400 },
      );
    }

    const identity = await fetchGoogleUserIdentity(client, row.user_id);
    const text = await draftReply(client, row, identity);
    const { error: upErr } = await client.database
      .from("emails")
      .update({ draft_reply: text })
      .eq("id", body.emailId)
      .eq("user_id", sessionUserId);

    if (upErr) throw upErr;
    return NextResponse.json({ draft_reply: text });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
