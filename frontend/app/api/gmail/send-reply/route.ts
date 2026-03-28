import { NextRequest, NextResponse } from "next/server";
import { createServerInsForge } from "@/lib/insforge";
import {
  requireGmailBrowserSession,
  resolveSessionUserId,
} from "@/lib/session-user";
import {
  fetchMessageReplyMeta,
  getGmailForUser,
  sendTextReply,
} from "@/lib/gmail";
import type { EmailRow } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const denied = requireGmailBrowserSession(req);
    if (denied) return denied;

    const body = (await req.json()) as {
      emailId?: string;
      body?: string;
      userId?: string | null;
    };
    if (!body.emailId || typeof body.body !== "string" || !body.body.trim()) {
      return NextResponse.json(
        { error: "emailId and non-empty body required" },
        { status: 400 },
      );
    }

    const client = createServerInsForge();
    const userId = await resolveSessionUserId(client, req, body.userId ?? null);
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { data: row, error } = await client.database
      .from("emails")
      .select("*")
      .eq("id", body.emailId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    if (!row) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    const email = row as EmailRow;
    if (!email.gmail_id || email.gmail_id.startsWith("seed")) {
      return NextResponse.json(
        {
          error:
            "Sending only works for real Gmail messages. Copy the draft and send from Gmail.",
        },
        { status: 400 },
      );
    }

    const gmail = await getGmailForUser(client, userId);
    if (!gmail) {
      return NextResponse.json(
        { error: "Gmail not connected" },
        { status: 400 },
      );
    }

    const meta = await fetchMessageReplyMeta(gmail, email.gmail_id);
    const sent = await sendTextReply(gmail, meta, body.body.trim());

    return NextResponse.json({
      ok: true,
      gmailMessageId: sent.id,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const insufficient =
      /insufficient|permission|403|access/i.test(message);
    return NextResponse.json(
      {
        error: insufficient
          ? "Gmail send permission missing. Sign out and sign in to Gmail again to grant send access."
          : message,
      },
      { status: insufficient ? 403 : 500 },
    );
  }
}
