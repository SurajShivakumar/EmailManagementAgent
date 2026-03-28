import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createOAuth2, persistGmailTokens } from "@/lib/gmail";
import {
  createOAuth2,
  persistGmailTokens,
  purgeSyncedGmailEmailsForUser,
} from "@/lib/gmail";
import { createServerInsForge } from "@/lib/insforge";
import {
  GMAIL_BROWSER_SESSION_COOKIE,
  SESSION_USER_COOKIE,
} from "@/lib/session-user";

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 400,
};

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const err = req.nextUrl.searchParams.get("error");

  const base = new URL(req.nextUrl.origin);

  if (err || !code || !state) {
    base.pathname = "/";
    base.searchParams.set("gmail", "error");
    return NextResponse.redirect(base);
  }

  let userId: string;
  try {
    const parsed = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8"),
    ) as { userId?: string };
    if (!parsed.userId) throw new Error("Invalid state");
    userId = parsed.userId;
  } catch {
    base.pathname = "/";
    base.searchParams.set("gmail", "error");
    return NextResponse.redirect(base);
  }

  try {
    const oauth2 = createOAuth2();
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const gmailAccountEmail = profile.data.emailAddress?.toLowerCase() ?? null;

    const client = createServerInsForge();
    await persistGmailTokens(client, userId, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      gmail_account_email: gmailAccountEmail,
    });

    oauth2.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const googleEmail = profile.data.emailAddress ?? null;

    await purgeSyncedGmailEmailsForUser(client, userId);

    if (googleEmail) {
      const { error: linkErr } = await client.database
        .from("gmail_credentials")
        .update({ linked_google_email: googleEmail })
        .eq("user_id", userId);
      if (linkErr) {
        console.warn(
          "[gmail/callback] linked_google_email column may be missing:",
          linkErr.message,
        );
      }
    }

    base.pathname = "/";
    base.searchParams.set("gmail", "connected");
    const res = NextResponse.redirect(base);
    res.cookies.set(SESSION_USER_COOKIE, userId, cookieBase);
    res.cookies.set(GMAIL_BROWSER_SESSION_COOKIE, "1", cookieBase);
    return res;
  } catch {
    base.pathname = "/";
    base.searchParams.set("gmail", "error");
    return NextResponse.redirect(base);
  }
}
