import { NextRequest, NextResponse } from "next/server";
import { createServerInsForge } from "@/lib/insforge";
import { processEmailRow } from "@/lib/agent/orchestrate";
import { resolveUserId } from "@/lib/default-user";
import type { EmailRow } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      emailId?: string;
      is_reply_to_sent?: boolean;
    };
    if (!body.emailId) {
      return NextResponse.json({ error: "emailId required" }, { status: 400 });
    }

    const client = createServerInsForge();
    const userId = await resolveUserId(client, null);
    const { data: email, error: fetchErr } = await client.database
      .from("emails")
      .select("*")
      .eq("id", body.emailId)
      .eq("user_id", userId)
      .single();

    if (fetchErr || !email) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    const result = await processEmailRow(client, email as EmailRow, {
      is_reply_to_sent: Boolean(body.is_reply_to_sent),
    });

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
