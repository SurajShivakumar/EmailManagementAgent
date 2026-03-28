import { NextRequest, NextResponse } from "next/server";
import { createServerInsForge } from "@/lib/insforge";
import { resolveSessionUserId } from "@/lib/session-user";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?: "delete" | "mark_unsubscribed";
      userId?: string;
      emailIds?: string[];
      category?: string;
      subscriptionId?: string;
    };

    const client = createServerInsForge();
    const userId = await resolveUserId(client, null);
    const userId = await resolveSessionUserId(client, req, body.userId ?? null);
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    if (body.action === "delete" && body.emailIds?.length) {
      const { error } = await client.database
        .from("emails")
        .update({ status: "deleted" })
        .in("id", body.emailIds)
        .eq("user_id", userId);
      if (error) throw error;
      return NextResponse.json({ ok: true, updated: body.emailIds.length });
    }

    if (body.action === "delete" && body.category) {
      const { data: rows, error: qErr } = await client.database
        .from("emails")
        .select("id")
        .eq("user_id", userId)
        .eq("category", body.category)
        .lte("priority_score", 4)
        .neq("status", "deleted");
      if (qErr) throw qErr;
      const ids = (rows ?? []).map((r: { id: string }) => r.id);
      if (!ids.length) {
        return NextResponse.json({ ok: true, updated: 0 });
      }
      const { error } = await client.database
        .from("emails")
        .update({ status: "deleted" })
        .in("id", ids)
        .eq("user_id", userId);
      if (error) throw error;
      return NextResponse.json({ ok: true, updated: ids.length });
    }

    if (body.action === "mark_unsubscribed" && body.subscriptionId) {
      const { error } = await client.database
        .from("subscriptions")
        .update({
          unsubscribed: true,
          unsubscribed_at: new Date().toISOString(),
        })
        .eq("id", body.subscriptionId)
        .eq("user_id", userId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action or payload" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
