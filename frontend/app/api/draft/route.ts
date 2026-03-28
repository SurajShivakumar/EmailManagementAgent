import { NextRequest, NextResponse } from "next/server";
import { createServerInsForge } from "@/lib/insforge";
import { draftReply } from "@/lib/agent/draft";
import { resolveUserId } from "@/lib/default-user";
import type { EmailRow } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { emailId?: string };
    if (!body.emailId) {
      return NextResponse.json({ error: "emailId required" }, { status: 400 });
    }

    const client = createServerInsForge();
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
    if ((row.priority_score ?? 0) < 7) {
      return NextResponse.json(
        { error: "Draft only for priority_score >= 7" },
        { status: 400 },
      );
    }

    const text = await draftReply(client, row);
    const { error: upErr } = await client.database
      .from("emails")
      .update({ draft_reply: text })
      .eq("id", body.emailId)
      .eq("user_id", userId);

    if (upErr) throw upErr;
    return NextResponse.json({ draft_reply: text });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
