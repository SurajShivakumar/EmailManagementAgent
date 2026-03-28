import { NextRequest, NextResponse } from "next/server";
import { createServerInsForge } from "@/lib/insforge";
import { resolveSessionUserId } from "@/lib/session-user";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      emailId?: string;
      draft_reply?: string;
      userId?: string | null;
    };
    if (!body.emailId || typeof body.draft_reply !== "string") {
      return NextResponse.json(
        { error: "emailId and draft_reply required" },
        { status: 400 },
      );
    }

    const client = createServerInsForge();
    const userId = await resolveSessionUserId(client, req, body.userId ?? null);
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { error } = await client.database
      .from("emails")
      .update({ draft_reply: body.draft_reply })
      .eq("id", body.emailId)
      .eq("user_id", userId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
