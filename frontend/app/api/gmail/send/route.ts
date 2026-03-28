import { NextRequest, NextResponse } from "next/server";
import { createServerInsForge } from "@/lib/insforge";
import { getGmailForUser, parseSenderEmailAddress } from "@/lib/gmail";
import { resolveUserId } from "@/lib/default-user";
import type { EmailRow } from "@/lib/types";

function encodeMime(text: string): string {
  return Buffer.from(text)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function POST(req: NextRequest) {
  try {
    const client = createServerInsForge();
    const body = (await req.json().catch(() => ({}))) as {
      emailId?: string;
    };

    if (!body.emailId) {
      return NextResponse.json(
        { error: "emailId is required" },
        { status: 400 },
      );
    }

    const userId = await resolveUserId(client, null);

    const { data: email, error } = await client.database
      .from("emails")
      .select("*")
      .eq("id", body.emailId)
      .eq("user_id", userId)
      .single();

    if (error || !email) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    const row = email as EmailRow;
    if (!row.draft_reply?.trim()) {
      return NextResponse.json(
        { error: "No draft reply found for this email" },
        { status: 400 },
      );
    }

    const to = parseSenderEmailAddress(row.sender);
    if (!to) {
      return NextResponse.json(
        { error: "Could not parse recipient email address" },
        { status: 400 },
      );
    }

    const gmail = await getGmailForUser(client, userId);
    if (!gmail) {
      return NextResponse.json(
        { error: "Gmail not connected. Visit /api/auth/gmail" },
        { status: 400 },
      );
    }

    const subject = row.subject?.trim() || "(no subject)";
    const mime = [
      `To: ${to}`,
      `Subject: Re: ${subject}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      row.draft_reply,
    ].join("\r\n");

    const sent = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodeMime(mime),
      },
    });

    const { error: upErr } = await client.database
      .from("emails")
      .update({ status: "actioned" })
      .eq("id", row.id)
      .eq("user_id", userId);

    if (upErr) throw upErr;

    return NextResponse.json({ ok: true, gmailMessageId: sent.data.id ?? null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
