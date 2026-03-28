import { createClient } from "@insforge/sdk";

export function createServerInsForge() {
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
  const anonKey = process.env.INSFORGE_ANON_KEY;
  if (!baseUrl || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_INSFORGE_URL or INSFORGE_ANON_KEY");
  }
  return createClient({ baseUrl, anonKey });
}

export function aiModel() {
  return (
    process.env.INSFORGE_AI_MODEL?.trim() || "anthropic/claude-sonnet-4.5"
  );
}
