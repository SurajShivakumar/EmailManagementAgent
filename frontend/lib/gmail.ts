import { google } from "googleapis";
import type { InsForgeClient } from "@/lib/insforge-client-type";

export function isGmailOAuthEnvConfigured(): boolean {
  return Boolean(
    process.env.GMAIL_CLIENT_ID?.trim() &&
      process.env.GMAIL_CLIENT_SECRET?.trim() &&
      process.env.GMAIL_REDIRECT_URI?.trim(),
  );
}

export function createOAuth2() {
  const id = process.env.GMAIL_CLIENT_ID;
  const secret = process.env.GMAIL_CLIENT_SECRET;
  const redirect = process.env.GMAIL_REDIRECT_URI;
  if (!id || !secret || !redirect) {
    throw new Error("Missing GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, or GMAIL_REDIRECT_URI");
  }
  return new google.auth.OAuth2(id, secret, redirect);
}

export function gmailConsentUrl(state: string) {
  const oauth2 = createOAuth2();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
    state,
  });
}

export function parseSenderEmailAddress(sender: string): string | null {
  const angle = sender.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim();

  const plain = sender.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(plain)) {
    return plain;
  }

  return null;
}

export async function getGmailForUser(client: InsForgeClient, userId: string) {
  const { data: cred, error } = await client.database
    .from("gmail_credentials")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!cred?.refresh_token) return null;

  const oauth2 = createOAuth2();
  oauth2.setCredentials({
    access_token: cred.access_token ?? undefined,
    refresh_token: cred.refresh_token,
    expiry_date: cred.token_expires_at
      ? new Date(cred.token_expires_at).getTime()
      : undefined,
  });

  return google.gmail({ version: "v1", auth: oauth2 });
}

function headerMap(
  headers: { name?: string | null; value?: string | null }[] | undefined,
): Record<string, string> {
  const m: Record<string, string> = {};
  for (const h of headers ?? []) {
    if (h.name && h.value) m[h.name.toLowerCase()] = h.value;
  }
  return m;
}

export function parseListUnsubscribe(headers: Record<string, string>): string | null {
  const v = headers["list-unsubscribe"];
  if (!v) return null;
  const angle = /<([^>]+)>/.exec(v);
  if (angle) return angle[1].trim();
  const first = v.split(",")[0]?.trim();
  return first || null;
}

export async function persistGmailTokens(
  client: InsForgeClient,
  userId: string,
  tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
    gmail_account_email?: string | null;
  },
) {
  const { data: prev } = await client.database
    .from("gmail_credentials")
    .select("refresh_token, access_token, gmail_account_email")
    .eq("user_id", userId)
    .maybeSingle();

  const row = {
    user_id: userId,
    access_token: tokens.access_token ?? prev?.access_token ?? null,
    refresh_token: tokens.refresh_token ?? prev?.refresh_token ?? null,
    token_expires_at: tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : null,
    gmail_account_email:
      tokens.gmail_account_email?.toLowerCase() ??
      prev?.gmail_account_email ??
      null,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await client.database
    .from("gmail_credentials")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    const { error } = await client.database
      .from("gmail_credentials")
      .update(row)
      .eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await client.database.from("gmail_credentials").insert([row]);
    if (error) throw error;
  }
}

export async function fetchInboxBatch(
  gmail: ReturnType<typeof google.gmail>,
  maxResults: number,
) {
  const list = await gmail.users.messages.list({
    userId: "me",
    maxResults,
    q: "in:inbox",
  });

  const messages = list.data.messages ?? [];
  const out: {
    gmailId: string;
    sender: string;
    subject: string;
    bodyPreview: string;
    listUnsubscribe: string | null;
    isReplyToSent: boolean;
    internalDate: string | null;
  }[] = [];

  for (const msg of messages) {
    if (!msg.id) continue;
    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "metadata",
      metadataHeaders: [
        "From",
        "Subject",
        "List-Unsubscribe",
        "In-Reply-To",
        "References",
      ],
    });

    const headers = headerMap(full.data.payload?.headers ?? undefined);
    const from = headers["from"] ?? "(unknown)";
    const subject = headers["subject"] ?? "(no subject)";
    const listUnsub = parseListUnsubscribe(headers);
    const isReplyToSent = Boolean(
      headers["in-reply-to"] || headers["references"],
    );
    const snippet = full.data.snippet ?? "";
    const internalMs = full.data.internalDate
      ? parseInt(full.data.internalDate, 10)
      : null;

    out.push({
      gmailId: msg.id,
      sender: from,
      subject,
      bodyPreview: snippet.slice(0, 500),
      listUnsubscribe: listUnsub,
      isReplyToSent,
      internalDate: internalMs
        ? new Date(internalMs).toISOString()
        : null,
    });
  }

  return out;
}
