export type EmailCategory =
  | "direct_reply"
  | "confirmation"
  | "newsletter"
  | "marketing"
  | "other";

export type RecommendedAction =
  | "draft_reply"
  | "bulk_delete_candidate"
  | "unsubscribe_prompt"
  | "none";

export type EmailStatus = "pending" | "actioned" | "deleted" | "classification_failed";

export type EmailRow = {
  id: string;
  user_id: string;
  gmail_id: string | null;
  gmail_account_email: string | null;
  sender: string;
  subject: string;
  body_preview: string | null;
  summary: string | null;
  priority_score: number | null;
  priority_reason: string | null;
  category: string | null;
  status: string | null;
  draft_reply: string | null;
  recommended_action: string | null;
  list_unsubscribe_url: string | null;
  received_at: string | null;
  created_at: string | null;
};

export type ClassificationResult = {
  summary: string;
  priority_score: number;
  priority_reason: string;
  category: EmailCategory;
  recommended_action: RecommendedAction;
};
