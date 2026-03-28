import type { InsForgeClient } from "@/lib/insforge-client-type";
import type { EmailRow } from "@/lib/types";
import { aiModel } from "@/lib/insforge";

export async function draftReply(
  client: InsForgeClient,
  email: Pick<EmailRow, "sender" | "subject" | "body_preview" | "summary">,
): Promise<string> {
  const completion = await client.ai.chat.completions.create({
    model: aiModel(),
    messages: [
      {
        role: "system",
        content:
          "You write concise, professional email replies. Match the tone and formality of the original. Output only the reply body text, no subject line or quotes.",
      },
      {
        role: "user",
        content: `Draft a reply to this email.\n\nFrom: ${email.sender}\nSubject: ${email.subject}\nSummary: ${email.summary ?? ""}\n\n---\n${email.body_preview ?? ""}`,
      },
    ],
    temperature: 0.4,
    maxTokens: 800,
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty draft response");
  return text;
}
