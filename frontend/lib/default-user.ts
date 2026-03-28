import type { InsForgeClient } from "@/lib/insforge-client-type";

export async function resolveUserId(
  client: InsForgeClient,
  explicit?: string | null,
): Promise<string> {
  if (explicit) return explicit;
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
