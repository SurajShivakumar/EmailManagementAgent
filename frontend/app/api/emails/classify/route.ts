import { NextRequest, NextResponse } from "next/server";
import { createServerInsForge } from "@/lib/insforge";
import { processEmailRow } from "@/lib/agent/orchestrate";
import { resolveUserId } from "@/lib/default-user";
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

    const body = (await req.json()) as {
      emailId?: string;
      is_reply_to_sent?: boolean;
      userId?: string;
    };
    if (!body.emailId) {
      return NextResponse.json({ error: "emailId required" }, { status: 400 });
    }

    const client = createServerInsForge();
    const userId = await resolveUserId(client, null);
    const sessionUserId = await resolveSessionUserId(
      client,
      req,
      body.userId ?? null,
    );
    if (!sessionUserId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { data: email, error: fetchErr } = await client.database
      .from("emails")
      .select("*")
      .eq("id", body.emailId)
      .eq("user_id", userId)
      .single();

    if (fetchErr || !email) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    const row = email as EmailRow;
    if (row.user_id !== sessionUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const identity = await fetchGoogleUserIdentity(client, row.user_id);
    const result = await processEmailRow(client, row, {
      is_reply_to_sent: Boolean(body.is_reply_to_sent),
      googleProfile: identity,
    });

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
