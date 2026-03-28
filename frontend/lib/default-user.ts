import type { InsForgeClient } from "@/lib/insforge-client-type";
import { cookies } from "next/headers";

export const SESSION_USER_COOKIE = "ema_user_id";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cookieUserId(): string | null {
  try {
    const value = cookies().get(SESSION_USER_COOKIE)?.value?.trim();
    if (value && isUuid(value)) return value;
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

  // Ignore duplicate insertion races across concurrent requests.
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

  const fromCookie = cookieUserId();
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
