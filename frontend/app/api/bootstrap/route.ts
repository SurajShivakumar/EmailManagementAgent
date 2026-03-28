import { NextResponse } from "next/server";
import { createServerInsForge } from "@/lib/insforge";
import { resolveUserId } from "@/lib/default-user";
import { isGmailOAuthEnvConfigured } from "@/lib/gmail";

/** Public-ish bootstrap: resolved user id + whether Gmail OAuth tokens exist. */
export async function GET() {
  try {
    const client = createServerInsForge();
    const userId = await resolveUserId(client, null);

    const { data: cred } = await client.database
      .from("gmail_credentials")
      .select("refresh_token")
      .eq("user_id", userId)
      .maybeSingle();

    const gmailConnected = Boolean(cred?.refresh_token);
    const gmailOAuthReady = isGmailOAuthEnvConfigured();

    return NextResponse.json({ userId, gmailConnected, gmailOAuthReady });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
