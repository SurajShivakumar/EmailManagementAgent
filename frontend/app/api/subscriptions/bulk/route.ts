import { NextRequest, NextResponse } from "next/server";
import { createServerInsForge } from "@/lib/insforge";
import {
  requireGmailBrowserSession,
  resolveSessionUserId,
} from "@/lib/session-user";
import { executeSubscriptionAutoUnsubscribe } from "@/lib/subscription-auto-unsubscribe";

const DELAY_MS = 450;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  try {
    const denied = requireGmailBrowserSession(req);
    if (denied) return denied;

    const body = (await req.json()) as {
      action?: "all" | "all_except";
      keepSubscriptionIds?: string[];
      userId?: string | null;
    };

    if (body.action !== "all" && body.action !== "all_except") {
      return NextResponse.json(
        { error: 'action must be "all" or "all_except"' },
        { status: 400 },
      );
    }

    const client = createServerInsForge();
    const userId = await resolveSessionUserId(client, req, body.userId ?? null);
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { data: subs, error: qErr } = await client.database
      .from("subscriptions")
      .select("id, unsubscribed")
      .eq("user_id", userId)
      .eq("unsubscribed", false);

    if (qErr) throw qErr;

    let ids = (subs ?? []).map((s: { id: string }) => s.id);
    if (body.action === "all_except") {
      const keep = new Set(body.keepSubscriptionIds ?? []);
      ids = ids.filter((id) => !keep.has(id));
    }

    const results: { id: string; ok: boolean; error?: string }[] = [];

    for (let i = 0; i < ids.length; i++) {
      if (i > 0) await sleep(DELAY_MS);
      const id = ids[i]!;
      const res = await executeSubscriptionAutoUnsubscribe(client, userId, id);
      if (res.ok) {
        results.push({ id, ok: true });
      } else {
        results.push({ id, ok: false, error: res.error });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    return NextResponse.json({
      ok: true,
      attempted: ids.length,
      succeeded: okCount,
      results,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
