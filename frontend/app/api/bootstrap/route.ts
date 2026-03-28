import { NextRequest, NextResponse } from "next/server";
import { createServerInsForge } from "@/lib/insforge";
import {
  hasGmailBrowserSession,
  resolveSessionUserId,
} from "@/lib/session-user";
import {
  fetchGoogleUserIdentity,
  isGmailOAuthEnvConfigured,
} from "@/lib/gmail";

/** Public-ish bootstrap: resolved user id + whether Gmail OAuth tokens exist. */
export async function GET(req: NextRequest) {
  try {
    const client = createServerInsForge();
    const userId = await resolveSessionUserId(
      client,
      req,
      req.nextUrl.searchParams.get("userId"),
    );

    if (!userId) {
      return NextResponse.json({
        userId: null,
        gmailConnected: false,
        gmailTokensWithoutBrowserSession: false,
        gmailOAuthReady: isGmailOAuthEnvConfigured(),
        gmailIdentity: null,
      });
    }

    const { data: cred } = await client.database
      .from("gmail_credentials")
      .select("refresh_token")
      .eq("user_id", userId)
      .maybeSingle();

    const hasTokens = Boolean(cred?.refresh_token);
    const browserGmail = hasGmailBrowserSession(req);
    const gmailConnected = hasTokens && browserGmail;
    const gmailOAuthReady = isGmailOAuthEnvConfigured();

    const gmailIdentity = gmailConnected
      ? await fetchGoogleUserIdentity(client, userId)
      : null;

    return NextResponse.json({
      userId,
      gmailConnected,
      /** Tokens exist in DB but this browser has not completed Gmail sign-in this session */
      gmailTokensWithoutBrowserSession: hasTokens && !browserGmail,
      gmailOAuthReady,
      gmailIdentity,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
