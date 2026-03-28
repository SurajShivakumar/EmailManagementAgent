import { NextRequest, NextResponse } from "next/server";
import {
  GMAIL_BROWSER_SESSION_COOKIE,
  SESSION_USER_COOKIE,
} from "@/lib/session-user";

/** Clears InsForge user + Gmail browser cookies (full sign-out for this app). */
export async function GET(req: NextRequest) {
  const home = new URL("/", req.url);
  const res = NextResponse.redirect(home);
  const clear = { httpOnly: true, path: "/", maxAge: 0 } as const;
  res.cookies.set(SESSION_USER_COOKIE, "", clear);
  res.cookies.set(GMAIL_BROWSER_SESSION_COOKIE, "", clear);
  return res;
}
