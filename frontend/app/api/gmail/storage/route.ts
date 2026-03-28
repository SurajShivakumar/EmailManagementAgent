import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createServerInsForge } from "@/lib/insforge";
import { resolveUserId } from "@/lib/default-user";
import { getGmailForUser, createOAuth2 } from "@/lib/gmail";

type StorageErrorCode = "DRIVE_API_DISABLED" | "DRIVE_SCOPE_MISSING" | "UNKNOWN";

function parseStorageError(err: unknown): {
  code: StorageErrorCode;
  message: string;
  enableUrl?: string;
} {
  const message = err instanceof Error ? err.message : String(err);
  const details = JSON.stringify(err ?? {});
  const combined = `${message} ${details}`;

  if (
    /drive\.googleapis\.com/i.test(combined) &&
    /(disabled|has not been used in project|accessNotConfigured)/i.test(combined)
  ) {
    const projectId = process.env.GCP_PROJECT_ID?.trim() || process.env.GOOGLE_CLOUD_PROJECT?.trim();
    return {
      code: "DRIVE_API_DISABLED",
      message: "Google Drive API is disabled for this Google Cloud project.",
      enableUrl: projectId
        ? `https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=${projectId}`
        : "https://console.developers.google.com/apis/api/drive.googleapis.com/overview",
    };
  }

  if (/insufficient permission|insufficientpermissions/i.test(combined)) {
    return {
      code: "DRIVE_SCOPE_MISSING",
      message: "Connected Gmail account has not granted Drive read permission.",
    };
  }

  return {
    code: "UNKNOWN",
    message,
  };
}

/** Fetch actual Google storage quota and email categorization stats */
export async function GET(req: NextRequest) {
  try {
    const client = createServerInsForge();
    const userId = await resolveUserId(client, null);

    const gmail = await getGmailForUser(client, userId);
    if (!gmail) {
      return NextResponse.json(
        { error: "Gmail not connected" },
        { status: 400 },
      );
    }

    // Get Gmail profile info
    const profile = await gmail.users.getProfile({ userId: "me" });
    const emailAddress = profile.data.emailAddress ?? "unknown";
    const messagesTotal = profile.data.messagesTotal ?? 0;
    const threadsTotal = profile.data.threadsTotal ?? 0;

    // Fetch unread count directly from the INBOX label.
    const inboxLabel = await gmail.users.labels.get({
      userId: "me",
      id: "INBOX",
    });
    const unreadCount = inboxLabel.data.messagesUnread ?? 0;

    // Get storage quota from Google Drive API.
    // Google does not provide separate Gmail vs Photos usage values.
    let storageQuota: {
      available: boolean;
      limitGb: number;
      usageGb: number;
      percentUsed: number;
      usageInDriveGb: number;
      usageInDriveTrashGb: number;
      usageFromGoogleServicesGb: number;
    } = {
      available: false,
      limitGb: 0,
      usageGb: 0,
      percentUsed: 0,
      usageInDriveGb: 0,
      usageInDriveTrashGb: 0,
      usageFromGoogleServicesGb: 0,
    };
    let storageWarning: string | null = null;
    let storageErrorCode: StorageErrorCode | null = null;
    let storageEnableUrl: string | null = null;

    try {
      // Get the OAuth2 client with credentials to use for Drive API
      const { data: cred } = await client.database
        .from("gmail_credentials")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (cred?.refresh_token) {
        const oauth2 = createOAuth2();
        oauth2.setCredentials({
          access_token: cred.access_token ?? undefined,
          refresh_token: cred.refresh_token,
          expiry_date: cred.token_expires_at
            ? new Date(cred.token_expires_at).getTime()
            : undefined,
        });

        const drive = google.drive({ version: "v3", auth: oauth2 });
        const about = await drive.about.get({ fields: "storageQuota" });

        if (about.data.storageQuota) {
          const limitBytes = Number(about.data.storageQuota.limit ?? 0);
          const usageBytes = Number(about.data.storageQuota.usage ?? 0);
          const usageInDriveBytes = Number(about.data.storageQuota.usageInDrive ?? 0);
          const usageInDriveTrashBytes = Number(
            about.data.storageQuota.usageInDriveTrash ?? 0,
          );
          const googleServicesBytes = Math.max(usageBytes - usageInDriveBytes, 0);
          const toGb = (bytes: number) =>
            Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100;

          storageQuota = {
            available: true,
            limitGb: toGb(limitBytes),
            usageGb: toGb(usageBytes),
            percentUsed: limitBytes > 0 ? Math.round((usageBytes / limitBytes) * 100) : 0,
            usageInDriveGb: toGb(usageInDriveBytes),
            usageInDriveTrashGb: toGb(usageInDriveTrashBytes),
            usageFromGoogleServicesGb: toGb(googleServicesBytes),
          };
        }
      }
    } catch (driveErr) {
      const parsed = parseStorageError(driveErr);
      storageWarning = parsed.message;
      storageErrorCode = parsed.code;
      storageEnableUrl = parsed.enableUrl ?? null;
      console.warn("Could not fetch Drive storage quota:", parsed);
    }

    // Get email counts by category from database
    const { data: categoryCounts, error: catErr } = await client.database
      .from("emails")
      .select("category")
      .eq("user_id", userId)
      .eq("status", "pending")
      .neq("category", null);

    if (catErr) throw catErr;

    const byCategory: Record<string, number> = {};
    (categoryCounts ?? []).forEach((row) => {
      const cat = (row as any).category || "uncategorized";
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    });

    // Get actionable emails
    const { data: priorityCounts, error: priErr } = await client.database
      .from("emails")
      .select("priority_score")
      .eq("user_id", userId)
      .eq("status", "pending")
      .gte("priority_score", 7);

    if (priErr) throw priErr;
    const actionableCount = priorityCounts?.length ?? 0;

    // Total emails in database
    const { data: allEmails, error: allErr } = await client.database
      .from("emails")
      .select("id", { count: "exact" })
      .eq("user_id", userId)
      .eq("status", "pending");

    if (allErr) throw allErr;
    const dbEmailCount = allEmails?.length ?? 0;

    console.log("Complete storage stats:", {
      email: emailAddress,
      storageQuota,
      gmailStats: {
        totalMessages: messagesTotal,
        unreadMessages: unreadCount,
        totalThreads: threadsTotal,
      },
      databaseStats: {
        totalEmails: dbEmailCount,
        actionableCount,
        byCategory,
      },
    });

    return NextResponse.json({
      email: emailAddress,
      storageQuota,
      storageWarning,
      storageErrorCode,
      storageEnableUrl,
      gmailStats: {
        totalMessages: messagesTotal,
        unreadMessages: unreadCount,
        totalThreads: threadsTotal,
      },
      databaseStats: {
        totalEmails: dbEmailCount,
        actionableEmails: actionableCount,
        byCategory,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Storage fetch error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
