import { parseSenderEmail } from "@/lib/agent/unsubscribe";

/** First name or friendly token for salutation (e.g. Dear Alex). */
export function addresseeFirstName(senderField: string): string {
  const { name, email } = parseSenderEmail(senderField);
  if (name) {
    const tok = name.split(/\s+/)[0] ?? "";
    const cleaned = tok.replace(/^[^a-zA-ZÀ-ÿ]+|[^a-zA-ZÀ-ÿ]+$/g, "");
    if (cleaned.length > 0) return cleaned;
  }
  const local = email.split("@")[0] ?? "";
  if (local.length > 1) {
    const part = local.split(/[._-]/)[0];
    if (part && part.length > 0) return part;
  }
  return local || "there";
}

export function signerFirstNameFromProfile(profile: {
  given_name?: string | null;
  name?: string | null;
  email?: string | null;
} | null | undefined): string {
  if (profile?.given_name?.trim()) {
    return profile.given_name.trim().split(/\s+/)[0]!;
  }
  if (profile?.name?.trim()) {
    return profile.name.trim().split(/\s+/)[0]!;
  }
  if (profile?.email) {
    const loc = profile.email.split("@")[0] ?? "";
    const part = loc.split(/[._-]/)[0];
    return part || loc || "Me";
  }
  return "Me";
}
