import { google } from "googleapis";
import type { InsForgeClient } from "@/lib/insforge-client-type";
import { parseSenderEmail } from "@/lib/agent/unsubscribe";

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

/** Read inbox + send + OpenID profile (name/email for UI). Re-consent if scopes change. */
export const GMAIL_OAUTH_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
] as const;

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
    scope: [...GMAIL_OAUTH_SCOPES],
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

export type GoogleUserIdentity = {
  email: string;
  /** Best display string (full name when available) */
  name: string;
  given_name?: string | null;
  family_name?: string | null;
  /** Normalized "First Last" from Google profile */
  full_name?: string | null;
  picture?: string | null;
};

/** OAuth2 client with stored refresh token (for UserInfo, etc.). */
export async function getOAuth2ClientForUser(
  client: InsForgeClient,
  userId: string,
) {
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
  return oauth2;
}

async function fetchUserinfoEndpoints(
  token: string,
): Promise<GoogleUserIdentity | null> {
  const urls = [
    "https://openidconnect.googleapis.com/v1/userinfo",
    "https://www.googleapis.com/oauth2/v3/userinfo",
    "https://www.googleapis.com/oauth2/v2/userinfo",
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) continue;
      const j = (await r.json()) as {
        email?: string;
        name?: string;
        given_name?: string;
        family_name?: string;
        picture?: string;
      };
      const email = j.email?.trim();
      if (!email) continue;
      const fromParts = [j.given_name, j.family_name]
        .filter(Boolean)
        .join(" ")
        .trim();
      const displayName = (j.name && String(j.name).trim()) || "";
      const display =
        displayName ||
        fromParts ||
        email.split("@")[0] ||
        email;
      return {
        email,
        name: display,
        given_name: j.given_name ?? null,
        family_name: j.family_name ?? null,
        full_name: fromParts || displayName || null,
        picture: j.picture ?? null,
      };
    } catch {
      continue;
    }
  }
  return null;
}

export async function fetchGoogleUserIdentity(
  insforge: InsForgeClient,
  userId: string,
): Promise<GoogleUserIdentity | null> {
  const oauth2 = await getOAuth2ClientForUser(insforge, userId);
  if (!oauth2) return null;

  try {
    const tokRes = await oauth2.getAccessToken();
    const token =
      tokRes?.token ?? (oauth2.credentials.access_token as string | undefined);
    if (token) {
      const fromUserinfo = await fetchUserinfoEndpoints(token);
      if (fromUserinfo) return fromUserinfo;
    }
  } catch {
    /* fall through */
  }

  try {
    const gmail = await getGmailForUser(insforge, userId);
    if (!gmail) return null;
    const p = await gmail.users.getProfile({ userId: "me" });
    const email = p.data.emailAddress;
    if (email) {
      const local = email.split("@")[0] || email;
      return {
        email,
        name: local,
        given_name: null,
        family_name: null,
        full_name: null,
        picture: null,
      };
    }
  } catch {
    /* ignore */
  }

  return null;
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

/** Remove previously synced real Gmail rows so a new Google account link does not mix inboxes. */
export async function purgeSyncedGmailEmailsForUser(
  client: InsForgeClient,
  userId: string,
): Promise<void> {
  const { error } = await client.database
    .from("emails")
    .update({ status: "deleted" })
    .eq("user_id", userId)
    .not("gmail_id", "is", null)
    .not("gmail_id", "ilike", "seed%");
  if (error) {
    console.warn("[purgeSyncedGmailEmailsForUser]", error.message);
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

function decodePartData(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

type MsgPart = {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: MsgPart[] | null;
};

function collectPlainTextParts(part: MsgPart | undefined, out: string[]): void {
  if (!part) return;
  if (part.mimeType === "text/plain" && part.body?.data) {
    try {
      out.push(decodePartData(part.body.data));
    } catch {
      /* ignore bad chunks */
    }
  }
  for (const p of part.parts ?? []) {
    collectPlainTextParts(p, out);
  }
}

function collectHtmlParts(part: MsgPart | undefined, out: string[]): void {
  if (!part) return;
  if (part.mimeType === "text/html" && part.body?.data) {
    try {
      out.push(decodePartData(part.body.data));
    } catch {
      /* ignore */
    }
  }
  for (const p of part.parts ?? []) {
    collectHtmlParts(p, out);
  }
}

/** Strip scripts/event handlers for safer iframe srcDoc (not a full sanitizer). */
export function sanitizeEmailHtmlForIframe(html: string): string {
  let s = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return s;
}

export type MessageBodies = { plain: string; html: string | null };

export async function fetchMessageBodies(
  gmail: ReturnType<typeof google.gmail>,
  gmailMessageId: string,
): Promise<MessageBodies> {
  const full = await gmail.users.messages.get({
    userId: "me",
    id: gmailMessageId,
    format: "full",
  });
  const payload = full.data.payload;
  const plainChunks: string[] = [];
  const htmlChunks: string[] = [];
  collectPlainTextParts(payload ?? undefined, plainChunks);
  collectHtmlParts(payload ?? undefined, htmlChunks);
  const snippet = (full.data.snippet ?? "").trim();
  const plain = plainChunks.join("\n\n").trim() || snippet;
  const html =
    htmlChunks.length > 0
      ? [...htmlChunks].sort((a, b) => b.length - a.length)[0]!
      : null;
  return { plain, html: html ? sanitizeEmailHtmlForIframe(html) : null };
}

/** Best-effort plain text body for a Gmail message (falls back to snippet). */
export async function fetchMessagePlainBody(
  gmail: ReturnType<typeof google.gmail>,
  gmailMessageId: string,
): Promise<string> {
  const { plain } = await fetchMessageBodies(gmail, gmailMessageId);
  return plain;
}

export type GmailReplyMeta = {
  threadId: string;
  gmailMessageId: string;
  messageIdHeader: string | null;
  references: string | null;
  /** Value suitable for the Reply-To / To header */
  replyToHeader: string;
  subject: string;
};

export async function fetchMessageReplyMeta(
  gmail: ReturnType<typeof google.gmail>,
  gmailMessageId: string,
): Promise<GmailReplyMeta> {
  const full = await gmail.users.messages.get({
    userId: "me",
    id: gmailMessageId,
    format: "metadata",
    metadataHeaders: [
      "From",
      "Subject",
      "Message-ID",
      "References",
      "Reply-To",
    ],
  });
  const headers = headerMap(full.data.payload?.headers ?? undefined);
  const from = headers["from"] ?? "";
  const replyTo = headers["reply-to"]?.trim();
  const replyToHeader = (replyTo || from).trim() || from;
  return {
    threadId: full.data.threadId ?? "",
    gmailMessageId,
    messageIdHeader: headers["message-id"] ?? null,
    references: headers["references"] ?? null,
    replyToHeader,
    subject: headers["subject"] ?? "(no subject)",
  };
}

function encodeRfc2047Subject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

/** Send a plain-text reply in-thread via Gmail API (requires gmail.send). */
export async function sendTextReply(
  gmail: ReturnType<typeof google.gmail>,
  meta: GmailReplyMeta,
  bodyText: string,
): Promise<{ id: string | null }> {
  const subj = meta.subject.trim();
  const reSubj = /^re:\s/i.test(subj) ? subj : `Re: ${subj}`;
  const lines: string[] = [
    `To: ${meta.replyToHeader}`,
    `Subject: ${encodeRfc2047Subject(reSubj)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  if (meta.messageIdHeader) {
    lines.push(`In-Reply-To: ${meta.messageIdHeader}`);
    const refs = [meta.references, meta.messageIdHeader]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (refs) lines.push(`References: ${refs}`);
  }
  lines.push("", bodyText.replace(/\r?\n/g, "\r\n"));
  const raw = Buffer.from(lines.join("\r\n"), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      threadId: meta.threadId || undefined,
    },
  });
  return { id: res.data.id ?? null };
}

/** Try HTTPS list-unsubscribe (GET, then POST if 405). */
export async function tryHttpListUnsubscribe(
  url: string,
): Promise<{ ok: boolean; method: string; status?: number; error?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, method: "none", error: "Invalid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, method: "none", error: "Only http(s) unsubscribe URLs are handled server-side" };
  }
  const signal = AbortSignal.timeout(20_000);
  try {
    let res = await fetch(url, { method: "GET", redirect: "follow", signal });
    if (res.ok) return { ok: true, method: "GET", status: res.status };
    if (res.status === 405) {
      res = await fetch(url, {
        method: "POST",
        redirect: "follow",
        signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "",
      });
      return { ok: res.ok, method: "POST", status: res.status };
    }
    return { ok: false, method: "GET", status: res.status };
  } catch (e) {
    return {
      ok: false,
      method: "GET",
      error: e instanceof Error ? e.message : "Request failed",
    };
  }
}

export function parseMailtoUnsubscribe(
  href: string,
): { to: string; subject: string; body: string } | null {
  if (!href.toLowerCase().startsWith("mailto:")) return null;
  const without = href.slice("mailto:".length);
  const qIdx = without.indexOf("?");
  const addrPart = (qIdx === -1 ? without : without.slice(0, qIdx)).trim();
  const query = qIdx === -1 ? "" : without.slice(qIdx + 1);
  const to = decodeURIComponent(addrPart.split(",")[0]?.trim() ?? "");
  if (!to.includes("@")) return null;
  const params = new URLSearchParams(query);
  return {
    to,
    subject: params.get("subject") ?? "Unsubscribe",
    body: params.get("body") ?? "",
  };
}

/** Send a minimal mailto-style unsubscribe message (requires gmail.send). */
export async function sendMailtoUnsubscribe(
  gmail: ReturnType<typeof google.gmail>,
  parsed: { to: string; subject: string; body: string },
): Promise<{ id: string | null }> {
  const lines = [
    `To: ${parsed.to}`,
    `Subject: ${encodeRfc2047Subject(parsed.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    parsed.body.replace(/\r?\n/g, "\r\n"),
  ];
  const raw = Buffer.from(lines.join("\r\n"), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
  return { id: res.data.id ?? null };
}

/** Extract bare email for matching stored `sender` field. */
export function senderFieldContainsEmail(senderField: string, email: string): boolean {
  const want = email.toLowerCase();
  const { email: parsed } = parseSenderEmail(senderField);
  return parsed.toLowerCase() === want || senderField.toLowerCase().includes(want);
}
