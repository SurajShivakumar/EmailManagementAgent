import { createClient } from "@insforge/sdk";

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

export function createServerInsForge() {
  const baseUrlRaw = process.env.NEXT_PUBLIC_INSFORGE_URL;
  const anonKey = process.env.INSFORGE_ANON_KEY;
  if (!baseUrlRaw || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_INSFORGE_URL or INSFORGE_ANON_KEY");
  }

  const baseUrl = normalizeBaseUrl(baseUrlRaw);
  return createClient({ baseUrl, anonKey });
}

export function aiModel() {
  return (
    process.env.INSFORGE_AI_MODEL?.trim() || "anthropic/claude-sonnet-4.5"
  );
}
