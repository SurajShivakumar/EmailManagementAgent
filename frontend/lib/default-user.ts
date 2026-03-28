import type { InsForgeClient } from "@/lib/insforge-client-type";
import { cookies } from "next/headers";
import {
  looksLikeSessionId,
  SESSION_USER_COOKIE,
} from "@/lib/session-user";

async function cookieUserId(): Promise<string | null> {
  try {
    const jar = await cookies();
    const value = jar.get(SESSION_USER_COOKIE)?.value?.trim();
    if (value && looksLikeSessionId(value)) return value;
  } catch {
    // Ignore when no request context exists.
  }
  return null;
}

async function ensureUserExists(client: InsForgeClient, userId: string): Promise<void> {
  const { data, error } = await client.database
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data?.id) return;

  const { error: insertErr } = await client.database
    .from("users")
    .insert([{ id: userId }]);

  if (insertErr && !/duplicate key|already exists/i.test(insertErr.message ?? "")) {
    throw insertErr;
  }
}

export async function resolveUserId(
  client: InsForgeClient,
  explicit?: string | null,
): Promise<string> {
  if (explicit) {
    await ensureUserExists(client, explicit);
    return explicit;
  }

  const fromCookie = await cookieUserId();
  if (fromCookie) {
    await ensureUserExists(client, fromCookie);
    return fromCookie;
  }

  const fromEnv = process.env.DEFAULT_USER_ID?.trim();
  if (fromEnv) return fromEnv;
  const { data, error } = await client.database
    .from("users")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) {
    throw new Error(
      "No user id: set DEFAULT_USER_ID or insert a row in users.",
    );
  }
  return data.id;
}
