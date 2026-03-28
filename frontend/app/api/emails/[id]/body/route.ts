import { NextRequest, NextResponse } from "next/server";
import { createServerInsForge } from "@/lib/insforge";
import {
  hasGmailBrowserSession,
  resolveSessionUserId,
} from "@/lib/session-user";
import { fetchMessageBodies, getGmailForUser } from "@/lib/gmail";
import type { EmailRow } from "@/lib/types";

/** Load full plain-text body from Gmail for a synced row (on-demand). */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id: emailId } = await ctx.params;
    const client = createServerInsForge();
    const userId = await resolveSessionUserId(
      client,
      req,
      req.nextUrl.searchParams.get("userId"),
    );
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { data: row, error } = await client.database
      .from("emails")
      .select("*")
      .eq("id", emailId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    if (!row) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    const email = row as EmailRow;
    if (
      email.gmail_id &&
      !email.gmail_id.startsWith("seed") &&
      !hasGmailBrowserSession(req)
    ) {
      return NextResponse.json(
        { error: "Sign in to Gmail in this browser to load message bodies." },
        { status: 401 },
      );
    }

    if (!email.gmail_id || email.gmail_id.startsWith("seed")) {
      const preview = email.body_preview ?? "";
      return NextResponse.json({
        plain: preview,
        html: null as string | null,
        body: preview,
        source: "preview",
      });
    }

    const gmail = await getGmailForUser(client, userId);
    if (!gmail) {
      return NextResponse.json(
        { error: "Gmail not connected" },
        { status: 400 },
      );
    }

    const { plain, html } = await fetchMessageBodies(gmail, email.gmail_id);
    return NextResponse.json({
      plain,
      html,
      body: plain,
      source: "gmail",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
