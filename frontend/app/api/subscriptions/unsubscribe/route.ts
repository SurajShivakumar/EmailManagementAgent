import { NextRequest, NextResponse } from "next/server";
import { createServerInsForge } from "@/lib/insforge";
import {
  requireGmailBrowserSession,
  resolveSessionUserId,
} from "@/lib/session-user";
import { executeSubscriptionAutoUnsubscribe } from "@/lib/subscription-auto-unsubscribe";

/** Auto-unsubscribe: HTTP(S) List-Unsubscribe or mailto via Gmail send. */
export async function POST(req: NextRequest) {
  try {
    const denied = requireGmailBrowserSession(req);
    if (denied) return denied;

    const body = (await req.json()) as {
      subscriptionId?: string;
      userId?: string | null;
    };
    if (!body.subscriptionId) {
      return NextResponse.json(
        { error: "subscriptionId required" },
        { status: 400 },
      );
    }

    const client = createServerInsForge();
    const userId = await resolveSessionUserId(client, req, body.userId ?? null);
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const res = await executeSubscriptionAutoUnsubscribe(
      client,
      userId,
      body.subscriptionId,
    );

    if (!res.ok) {
      const insufficient =
        /insufficient|permission|403|access/i.test(res.error);
      return NextResponse.json(
        {
          error: insufficient
            ? "Gmail send permission missing for mailto unsubscribe. Re-connect Gmail with send access."
            : res.error,
          detail: res.detail,
        },
        {
          status: insufficient
            ? 403
            : res.status >= 400
              ? res.status
              : 500,
        },
      );
    }

    return NextResponse.json({ ok: true, detail: res.detail });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const insufficient =
      /insufficient|permission|403|access/i.test(message);
    return NextResponse.json(
      {
        error: insufficient
          ? "Gmail send permission missing for mailto unsubscribe. Re-connect Gmail with send access."
          : message,
      },
      { status: insufficient ? 403 : 500 },
    );
  }
}
