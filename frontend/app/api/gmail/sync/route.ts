import { NextRequest, NextResponse } from "next/server";
import { createServerInsForge } from "@/lib/insforge";
import {
  requireGmailBrowserSession,
  resolveSessionUserId,
} from "@/lib/session-user";
import {
  fetchInboxBatch,
  fetchGoogleUserIdentity,
  getGmailForUser,
} from "@/lib/gmail";
import { processEmailRow } from "@/lib/agent/orchestrate";
import type { EmailRow } from "@/lib/types";

/** Pull recent inbox messages into InsForge `emails`, then classify each new row. */
export async function POST(req: NextRequest) {
  try {
    const denied = requireGmailBrowserSession(req);
    if (denied) return denied;

    const client = createServerInsForge();
    const body = (await req.json().catch(() => ({}))) as {
      userId?: string;
      maxResults?: number;
      resetBeforeSync?: boolean;
    };
    const userId = await resolveUserId(client, null);
    const maxResults = Math.min(body.maxResults ?? 25, 50);
    const resetBeforeSync = Boolean(body.resetBeforeSync);

    if (resetBeforeSync) {
      const { error: wipeErr } = await client.database
        .from("emails")
        .delete()
        .eq("user_id", userId);
      if (wipeErr) throw wipeErr;
    }
    const userId = await resolveSessionUserId(client, req, body.userId ?? null);
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    const maxResults = Math.min(body.maxResults ?? 50, 100);

    const gmail = await getGmailForUser(client, userId);
    if (!gmail) {
      return NextResponse.json(
        { error: "Gmail not connected. Visit /api/auth/gmail" },
        { status: 400 },
      );
    }

    const { data: cred, error: credErr } = await client.database
      .from("gmail_credentials")
      .select("gmail_account_email")
      .eq("user_id", userId)
      .maybeSingle();
    if (credErr) throw credErr;
    let gmailAccountEmail = cred?.gmail_account_email?.toLowerCase() ?? null;

    if (!gmailAccountEmail) {
      const profile = await gmail.users.getProfile({ userId: "me" });
      gmailAccountEmail = profile.data.emailAddress?.toLowerCase() ?? null;
      if (gmailAccountEmail) {
        const { error: upCredErr } = await client.database
          .from("gmail_credentials")
          .update({ gmail_account_email: gmailAccountEmail })
          .eq("user_id", userId);
        if (upCredErr) throw upCredErr;
      }
    }

    if (gmailAccountEmail) {
      const baseCleanup = client.database
        .from("emails")
        .delete()
        .eq("user_id", userId)
        .not("gmail_id", "is", null)
        .not("gmail_id", "ilike", "seed%");

      const { error: nullTagErr } = await baseCleanup.is(
        "gmail_account_email",
        null,
      );
      if (nullTagErr) throw nullTagErr;

      const { error: otherAccountErr } = await client.database
        .from("emails")
        .delete()
        .eq("user_id", userId)
        .not("gmail_id", "is", null)
        .not("gmail_id", "ilike", "seed%")
        .neq("gmail_account_email", gmailAccountEmail);
      if (otherAccountErr) throw otherAccountErr;
    }

    const batch = await fetchInboxBatch(gmail, maxResults);
    const identity = await fetchGoogleUserIdentity(client, userId);
    let inserted = 0;
    let processed = 0;

    for (const m of batch) {
      const { data: existing } = await client.database
        .from("emails")
        .select("id, status")
        .eq("user_id", userId)
        .eq("gmail_id", m.gmailId)
        .maybeSingle();

      if (existing) {
        // If this email was previously marked deleted, revive it on sync.
        if ((existing as { status?: string | null }).status === "deleted") {
          const { error: reviveErr } = await client.database
            .from("emails")
            .update({
              status: "pending",
              gmail_account_email: gmailAccountEmail,
              sender: m.sender,
              subject: m.subject,
              body_preview: m.bodyPreview,
              list_unsubscribe_url: m.listUnsubscribe,
              received_at: m.internalDate ?? new Date().toISOString(),
            })
            .eq("id", (existing as { id: string }).id);
          if (reviveErr) throw reviveErr;
          inserted += 1;
        }
        continue;
      }

      const { data: row, error: insErr } = await client.database
        .from("emails")
        .insert([
          {
            user_id: userId,
            gmail_id: m.gmailId,
            gmail_account_email: gmailAccountEmail,
            sender: m.sender,
            subject: m.subject,
            body_preview: m.bodyPreview,
            list_unsubscribe_url: m.listUnsubscribe,
            received_at: m.internalDate ?? new Date().toISOString(),
            status: "pending",
          },
        ])
        .select("*")
        .single();

      if (insErr) throw insErr;
      inserted += 1;
      if (row) {
        try {
          await processEmailRow(client, row as EmailRow, {
            is_reply_to_sent: m.isReplyToSent,
          });
          processed += 1;
        } catch (classifyErr) {
          // Log classification error but continue syncing
          console.warn(
            `Failed to classify email ${row.id}:`,
            classifyErr instanceof Error ? classifyErr.message : String(classifyErr),
          );
          // Update email status to indicate classification failed
          const { error: statusErr } = await client.database
            .from("emails")
            .update({ status: "classification_failed" })
            .eq("id", row.id);
          if (statusErr) {
            console.warn(
              `Failed to update email status for ${row.id}:`,
              statusErr,
            );
          }
        }
        await processEmailRow(client, row as EmailRow, {
          is_reply_to_sent: m.isReplyToSent,
          googleProfile: identity,
        });
        processed += 1;
      }
    }

    return NextResponse.json({ inserted, classified: processed });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
