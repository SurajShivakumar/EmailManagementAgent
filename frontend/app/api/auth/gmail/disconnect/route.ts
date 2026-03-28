import { NextResponse } from "next/server";
import { createServerInsForge } from "@/lib/insforge";
import { resolveUserId } from "@/lib/default-user";

/** Disconnect Gmail for the resolved user by deleting stored OAuth tokens. */
export async function POST() {
  try {
    const client = createServerInsForge();
    const userId = await resolveUserId(client, null);

    const { data: cred } = await client.database
      .from("gmail_credentials")
      .select("gmail_account_email")
      .eq("user_id", userId)
      .maybeSingle();

    const gmailAccountEmail = cred?.gmail_account_email?.toLowerCase() ?? null;

    const { error } = await client.database
      .from("gmail_credentials")
      .delete()
      .eq("user_id", userId);

    if (error) throw error;

    // Also clear synced Gmail emails for this account to avoid cross-account carryover.
    let cleanupQuery = client.database
      .from("emails")
      .delete()
      .eq("user_id", userId)
      .not("gmail_id", "is", null)
      .not("gmail_id", "ilike", "seed%");

    if (gmailAccountEmail) {
      cleanupQuery = cleanupQuery.eq("gmail_account_email", gmailAccountEmail);
    }

    const { error: cleanupErr } = await cleanupQuery;
    if (cleanupErr) throw cleanupErr;

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
