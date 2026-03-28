import type { InsForgeClient } from "@/lib/insforge-client-type";
import type { EmailRow } from "@/lib/types";
import { aiModel } from "@/lib/insforge";
import {
  addresseeFirstName,
  signerFirstNameFromProfile,
} from "@/lib/address-greeting";

export type DraftGoogleProfile = {
  given_name?: string | null;
  name?: string | null;
  email?: string | null;
} | null;

export async function draftReply(
  client: InsForgeClient,
  email: Pick<EmailRow, "sender" | "subject" | "body_preview" | "summary">,
  googleProfile?: DraftGoogleProfile,
): Promise<string> {
  const addressee = addresseeFirstName(email.sender);
  const signer = signerFirstNameFromProfile(googleProfile);

  const completion = await client.ai.chat.completions.create({
    model: aiModel(),
    messages: [
      {
        role: "system",
        content:
          "You write professional email replies. Mirror the original message's formality (casual vs formal). Structure your output exactly as:\n" +
          "1) First line: a short salutation addressing the recipient by the provided first name or appropriate form (e.g. Dear Alex, or Hi Taylor,).\n" +
          "2) One blank line, then the body (substance of the reply).\n" +
          "3) One blank line, then a closing line exactly: Sincerely,\n" +
          "4) Next line: only the signer's first name provided by the user (no extra words).\n" +
          "Do not add a subject line or quoted thread. Do not invent a different sign-off than Sincerely for the closing block.",
      },
      {
        role: "user",
        content:
          `Recipient first name for greeting: ${addressee}\n` +
          `Your first name for signature line: ${signer}\n\n` +
          `From: ${email.sender}\nSubject: ${email.subject}\nSummary: ${email.summary ?? ""}\n\n---\n${email.body_preview ?? ""}`,
      },
    ],
    temperature: 0.35,
    maxTokens: 900,
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty draft response");
  return text;
}
