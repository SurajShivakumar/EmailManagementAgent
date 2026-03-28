import { NextRequest, NextResponse } from "next/server";
import { createServerInsForge } from "@/lib/insforge";
import { resolveUserId } from "@/lib/default-user";
import { groupBulkDeleteCandidates } from "@/lib/agent/categorize";
import type { EmailRow } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const client = createServerInsForge();
    const userId = await resolveUserId(
      client,
      req.nextUrl.searchParams.get("userId"),
    );

    const mode = req.nextUrl.searchParams.get("mode");
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit =
      limitParam != null ? Math.min(parseInt(limitParam, 10) || 50, 100) : null;

    let query = client.database
      .from("emails")
      .select("*")
      .eq("user_id", userId);

    if (mode === "gmail_recent") {
      query = query
        .not("gmail_id", "is", null)
        .not("gmail_id", "ilike", "seed%");
    } else if (mode === "demo") {
      query = query.ilike("gmail_id", "seed%");
    }

    query = query
      .order("received_at", { ascending: false, nullsFirst: true })
      .order("priority_score", { ascending: false, nullsFirst: false });

    if (limit != null) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    const emails = (data ?? []) as EmailRow[];

    let bulkGroups = groupBulkDeleteCandidates([], 3);
    let subscriptions: Record<string, unknown>[] = [];

    if (!mode) {
      bulkGroups = groupBulkDeleteCandidates(emails, 3);
      const { data: subs } = await client.database
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .eq("unsubscribed", false);
      subscriptions = subs ?? [];
    }

    return NextResponse.json({
      userId,
      emails,
      bulkGroups,
      subscriptions,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
