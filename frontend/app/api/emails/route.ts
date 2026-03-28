import { NextRequest, NextResponse } from "next/server";
import { createServerInsForge } from "@/lib/insforge";
import {
  hasGmailBrowserSession,
  resolveSessionUserId,
} from "@/lib/session-user";
import { groupBulkDeleteCandidates } from "@/lib/agent/categorize";
import type { EmailRow } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const client = createServerInsForge();
    const userId = await resolveUserId(client, null);
    const userId = await resolveSessionUserId(
      client,
      req,
      req.nextUrl.searchParams.get("userId"),
    );

    if (!userId) {
      return NextResponse.json({
        userId: null,
        emails: [],
        bulkGroups: [],
        subscriptions: [],
      });
    }

    const mode = req.nextUrl.searchParams.get("mode");
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit =
      limitParam != null ? Math.min(parseInt(limitParam, 10) || 50, 100) : null;

    let gmailAccountEmail: string | null = null;
    if (mode === "gmail_recent") {
      const { data: cred, error: credErr } = await client.database
        .from("gmail_credentials")
        .select("gmail_account_email")
        .eq("user_id", userId)
        .maybeSingle();
      if (credErr) throw credErr;
      gmailAccountEmail = cred?.gmail_account_email?.toLowerCase() ?? null;
    if (mode === "gmail_recent" && !hasGmailBrowserSession(req)) {
      return NextResponse.json({
        userId,
        emails: [],
        bulkGroups: [],
        subscriptions: [],
      });
    }

    let query = client.database
      .from("emails")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "deleted");

    if (mode === "gmail_recent") {
      query = query
        .not("gmail_id", "is", null)
        .not("gmail_id", "ilike", "seed%");
      if (gmailAccountEmail) {
        query = query.eq("gmail_account_email", gmailAccountEmail);
      }
    } else if (mode === "demo") {
      query = query.ilike("gmail_id", "seed%");
    }

    query = query
      .order("received_at", { ascending: false, nullsFirst: false })
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
