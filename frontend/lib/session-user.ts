import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { InsForgeClient } from "@/lib/insforge-client-type";

/** HttpOnly cookie set after Gmail OAuth — keeps this browser tied to one InsForge user. */
export const SESSION_USER_COOKIE = "ema_session_uid";

/**
 * HttpOnly cookie set only when the user completes Gmail OAuth in this browser.
 * DB may still hold refresh tokens, but we treat the app as "signed out of Gmail" until this is set.
 */
export const GMAIL_BROWSER_SESSION_COOKIE = "ema_gmail_browser";

export function hasGmailBrowserSession(req: NextRequest): boolean {
  return req.cookies.get(GMAIL_BROWSER_SESSION_COOKIE)?.value === "1";
}

/** Use on API routes that call Gmail or show synced inbox for this browser. */
export function requireGmailBrowserSession(req: NextRequest): NextResponse | null {
  if (!hasGmailBrowserSession(req)) {
    return NextResponse.json(
      {
        error:
          "Gmail is not active in this browser. Click “Sign in to Gmail” to connect.",
      },
      { status: 401 },
    );
  }
  return null;
}

/** InsForge / Postgres ids are usually UUIDs; allow alphanum ids without weird chars. */
function looksLikeSessionId(v: string): boolean {
  const t = v.trim();
  if (t.length < 8 || t.length > 200) return false;
  if (/[<>{}"'\s\\]/.test(t)) return false;
  return /^[\w.-]+$/.test(t);
}

/**
 * Resolve the signed-in browser user for API routes.
 * - Valid `ema_session_uid` (set on Gmail OAuth callback) → that user.
 * - Optional `?userId=` / body hint only in non-production or when ALLOW_USER_ID_QUERY=1 (local testing).
 * - Otherwise null — first visit is "logged out"; no DEFAULT_USER_ID fallback.
 */
export async function resolveSessionUserId(
  _client: InsForgeClient,
  req: NextRequest,
  clientHint?: string | null,
): Promise<string | null> {
  const rawCookie = req.cookies.get(SESSION_USER_COOKIE)?.value;
  if (rawCookie && looksLikeSessionId(rawCookie)) {
    return rawCookie.trim();
  }
  const allowQueryHint =
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_USER_ID_QUERY === "1";
  if (allowQueryHint && clientHint?.trim()) {
    return clientHint.trim();
  }
  return null;
}
