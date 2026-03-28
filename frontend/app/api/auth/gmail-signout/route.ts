import { NextRequest, NextResponse } from "next/server";
import { GMAIL_BROWSER_SESSION_COOKIE } from "@/lib/session-user";

/** Keeps InsForge session user cookie; only ends Gmail-in-this-browser (shows sign-in again). */
export async function GET(req: NextRequest) {
  const home = new URL("/", req.url);
  const res = NextResponse.redirect(home);
  res.cookies.set(GMAIL_BROWSER_SESSION_COOKIE, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return res;
}
