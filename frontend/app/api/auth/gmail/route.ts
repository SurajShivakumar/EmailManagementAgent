import { NextRequest, NextResponse } from "next/server";
import { gmailConsentUrl, isGmailOAuthEnvConfigured } from "@/lib/gmail";
import { createServerInsForge } from "@/lib/insforge";
import { resolveUserId } from "@/lib/default-user";

/** Start Gmail OAuth (redirect to Google). */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;

  try {
    if (!isGmailOAuthEnvConfigured()) {
      const u = new URL("/", origin);
      u.searchParams.set("gmail_setup", "1");
      return NextResponse.redirect(u);
    }

    const client = createServerInsForge();
    const userId = await resolveUserId(client, null);
    const state = Buffer.from(JSON.stringify({ userId }), "utf8").toString(
      "base64url",
    );
    const url = gmailConsentUrl(state);
    return NextResponse.redirect(url);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const u = new URL("/", origin);
    u.searchParams.set("gmail_error", message);
    return NextResponse.redirect(u);
  }
}
