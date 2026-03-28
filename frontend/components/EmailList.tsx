"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailRow } from "@/lib/types";
import { EmailCard } from "@/components/EmailCard";
import { BulkDeletePrompt } from "@/components/BulkDeletePrompt";
import { UnsubscribePrompt } from "@/components/UnsubscribePrompt";

type Group = { category: string; count: number; ids: string[] };

type Sub = {
  id: string;
  sender_email: string;
  sender_name: string | null;
  unsubscribed: boolean;
};

type Bootstrap = {
  userId: string;
  gmailConnected: boolean;
  gmailOAuthReady: boolean;
};

function userQs(userId: string | null) {
  return userId ? `?userId=${encodeURIComponent(userId)}` : "";
}

export function EmailList() {
  const router = useRouter();
  const search = useSearchParams();
  const qOverride = search.get("userId");

  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [bootErr, setBootErr] = useState<string | null>(null);

  const userId = qOverride ?? bootstrap?.userId ?? null;
  const qs = userQs(userId);
  const gmailConnected = bootstrap?.gmailConnected ?? false;
  const gmailOAuthReady = bootstrap?.gmailOAuthReady ?? false;

  const [gmailEmails, setGmailEmails] = useState<EmailRow[]>([]);
  const [demoEmails, setDemoEmails] = useState<EmailRow[]>([]);
  const [bulkGroups, setBulkGroups] = useState<Group[]>([]);
  const [subscriptions, setSubscriptions] = useState<Sub[]>([]);

  const [selectedGmailId, setSelectedGmailId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const syncedOnceRef = useRef(false);
  const [appOrigin, setAppOrigin] = useState("http://localhost:3000");

  useEffect(() => {
    setAppOrigin(window.location.origin);
  }, []);

  const loadAlerts = useCallback(async () => {
    if (!userId) return;
    const res = await fetch(`/api/emails${qs}`);
    const j = await res.json();
    if (!res.ok) return;
    setBulkGroups(j.bulkGroups ?? []);
    setSubscriptions(j.subscriptions ?? []);
  }, [userId, qs]);

  const loadGmailPick = useCallback(async () => {
    if (!userId) return;
    const res = await fetch(
      `/api/emails${qs}${qs.includes("?") ? "&" : "?"}mode=gmail_recent&limit=10`,
    );
    const j = await res.json();
    if (!res.ok) return;
    const list = (j.emails ?? []) as EmailRow[];
    setGmailEmails(list.filter((e) => e.status !== "deleted"));
  }, [userId, qs]);

  const loadDemo = useCallback(async () => {
    if (!userId) return;
    const sep = qs ? "&" : "?";
    const res = await fetch(`/api/emails${qs}${sep}mode=demo`);
    const j = await res.json();
    if (!res.ok) return;
    setDemoEmails(
      ((j.emails ?? []) as EmailRow[]).filter((e) => e.status !== "deleted"),
    );
  }, [userId, qs]);

  const refreshAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    await Promise.all([loadAlerts(), loadGmailPick(), loadDemo()]);
    setLoading(false);
  }, [userId, loadAlerts, loadGmailPick, loadDemo]);

  const syncGmailInbox = useCallback(
    async (maxResults = 10) => {
      if (!userId) return;
      setSyncing(true);
      try {
        const res = await fetch("/api/gmail/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, maxResults }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "Sync failed");
        }
        await refreshAll();
      } finally {
        setSyncing(false);
      }
    },
    [userId, refreshAll],
  );

  useEffect(() => {
    (async () => {
      setBootErr(null);
      const res = await fetch("/api/bootstrap");
      const j = await res.json();
      if (!res.ok) {
        setBootErr(j.error ?? "Bootstrap failed");
        setLoading(false);
        return;
      }
      setBootstrap({
        userId: j.userId as string,
        gmailConnected: Boolean(j.gmailConnected),
        gmailOAuthReady: Boolean(j.gmailOAuthReady),
      });
    })();
  }, []);

  useEffect(() => {
    if (!userId) return;
    refreshAll();
  }, [userId, refreshAll]);

  useEffect(() => {
    if (!userId || !gmailConnected) return;

    const oauthReturn = search.get("gmail") === "connected";
    if (oauthReturn) {
      (async () => {
        syncedOnceRef.current = true;
        await syncGmailInbox(10);
        const tail = qOverride
          ? `?userId=${encodeURIComponent(qOverride)}`
          : "";
        router.replace(`/${tail}`);
      })();
      return;
    }

    if (!syncedOnceRef.current) {
      syncedOnceRef.current = true;
      syncGmailInbox(10);
    }
  }, [userId, gmailConnected, search, syncGmailInbox, router, qOverride]);

  useEffect(() => {
    if (!gmailEmails.length) {
      setSelectedGmailId("");
      return;
    }
    setSelectedGmailId((prev) => {
      if (prev && gmailEmails.some((e) => e.id === prev)) return prev;
      return gmailEmails[0].id;
    });
  }, [gmailEmails]);

  async function seedDemo() {
    if (!userId) return;
    const res = await fetch("/api/emails/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Could not load demo emails");
      return;
    }
    await loadDemo();
    await loadAlerts();
  }

  async function classifyOne(id: string) {
    const res = await fetch("/api/emails/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailId: id, is_reply_to_sent: false }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Re-run failed");
      return;
    }
    await refreshAll();
  }

  const selectedGmail = gmailEmails.find((e) => e.id === selectedGmailId);

  if (bootErr) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-red-400">{bootErr}</p>
        <p className="mt-2 text-sm text-slate-500">
          Configure <code className="text-slate-300">.env.local</code> and ensure a
          user exists or set{" "}
          <code className="text-slate-300">DEFAULT_USER_ID</code>.
        </p>
      </div>
    );
  }

  if (!bootstrap || !userId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-slate-400">
        Loading…
      </div>
    );
  }

  const signInHref = `/api/auth/gmail?userId=${encodeURIComponent(userId)}`;
  const gmailSetupHint =
    search.get("gmail_setup") === "1" || search.get("gmail_error");
  const gmailErrorRaw = search.get("gmail_error");

  function dismissGmailQueryParams() {
    const tail = qOverride
      ? `?userId=${encodeURIComponent(qOverride)}`
      : "";
    router.replace(`/${tail}`);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
          Email Management Agent
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          AI-ranked Gmail with summaries — backed by InsForge.
        </p>
      </header>

      {(gmailSetupHint || !gmailOAuthReady) && !gmailConnected && (
        <div className="mb-8 rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 text-sm text-amber-100/90">
          <p className="font-medium text-amber-50">Gmail sign-in needs Google OAuth credentials</p>
          <p className="mt-2 text-xs text-amber-200/70">
            Add these to <code className="rounded bg-black/30 px-1">frontend/.env.local</code>,
            then restart <code className="rounded bg-black/30 px-1">npm run dev</code>:
          </p>
          <ul className="mt-2 list-inside list-decimal text-xs text-amber-200/80">
            <li>
              In{" "}
              <a
                className="text-amber-300 underline hover:text-amber-200"
                href="https://console.cloud.google.com/apis/library/gmail.googleapis.com"
                target="_blank"
                rel="noreferrer"
              >
                Google Cloud Console
              </a>
              , enable the <strong>Gmail API</strong> for your project.
            </li>
            <li>
              Create an <strong>OAuth 2.0 Client ID</strong> (Application type:{" "}
              <strong>Web application</strong>).
            </li>
            <li>
              Under <strong>Authorized redirect URIs</strong>, add exactly:{" "}
              <code className="break-all rounded bg-black/40 px-1 text-amber-100">
                {appOrigin}/api/auth/gmail/callback
              </code>
            </li>
            <li>
              Set <code className="rounded bg-black/30 px-1">GMAIL_CLIENT_ID</code>,{" "}
              <code className="rounded bg-black/30 px-1">GMAIL_CLIENT_SECRET</code>, and{" "}
              <code className="rounded bg-black/30 px-1">GMAIL_REDIRECT_URI</code> (same URL as
              above) in <code className="rounded bg-black/30 px-1">.env.local</code>.
            </li>
          </ul>
          {gmailErrorRaw && (
            <p className="mt-2 text-xs text-red-300/90">{gmailErrorRaw}</p>
          )}
          <button
            type="button"
            onClick={dismissGmailQueryParams}
            className="mt-3 text-xs text-amber-400 underline hover:text-amber-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {!gmailConnected ? (
        <div className="mb-10 flex flex-col items-center justify-center gap-4">
          {gmailOAuthReady ? (
            <a
              href={signInHref}
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-8 py-3 text-base font-medium text-white shadow-lg shadow-blue-900/30 hover:bg-blue-500"
            >
              Sign in to Gmail
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex cursor-not-allowed items-center justify-center rounded-xl bg-slate-600 px-8 py-3 text-base font-medium text-slate-300 opacity-80"
            >
              Sign in to Gmail
            </button>
          )}
          <p className="max-w-md text-center text-xs text-slate-500">
            {gmailOAuthReady
              ? "You’ll be asked to allow read-only access to your Gmail inbox so we can fetch your latest messages and score them."
              : "Configure Google OAuth in .env.local (see above) to enable this button."}
          </p>
        </div>
      ) : (
        <section className="mb-10 rounded-2xl border border-slate-700/80 bg-slate-900/40 p-6">
          <h2 className="text-lg font-medium text-white">Your Gmail</h2>
          <p className="mt-1 text-xs text-slate-500">
            Recent messages (up to 10). Choose one to see AI priority, summary,
            and suggested reply.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block min-w-0 flex-1 text-sm text-slate-400">
              <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
                Inbox message
              </span>
              <select
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={selectedGmailId}
                onChange={(e) => setSelectedGmailId(e.target.value)}
                disabled={!gmailEmails.length || loading || syncing}
              >
                {gmailEmails.length === 0 ? (
                  <option value="">No Gmail messages loaded yet</option>
                ) : (
                  gmailEmails.map((e) => (
                    <option key={e.id} value={e.id}>
                      {(e.subject || "(no subject)").slice(0, 56)}
                      {e.subject && e.subject.length > 56 ? "…" : ""} —{" "}
                      {e.sender.replace(/<[^>]+>/, "").trim().slice(0, 28)}
                    </option>
                  ))
                )}
              </select>
            </label>
            <button
              type="button"
              onClick={() => syncGmailInbox(10)}
              disabled={syncing}
              className="shrink-0 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 hover:bg-slate-700 disabled:opacity-50"
            >
              {syncing ? "Refreshing…" : "Refresh inbox"}
            </button>
          </div>

          {(loading || syncing) && (
            <p className="mt-3 text-xs text-slate-500">Updating…</p>
          )}

          {selectedGmail && (
            <div className="mt-6">
              <EmailCard email={selectedGmail} onClassify={classifyOne} />
            </div>
          )}

          {!selectedGmail && gmailConnected && !loading && !syncing && (
            <p className="mt-6 text-sm text-slate-500">
              No synced Gmail messages in the database yet. Click{" "}
              <strong className="text-slate-400">Refresh inbox</strong> after
              signing in.
            </p>
          )}
        </section>
      )}

      <section className="mb-10 rounded-2xl border border-dashed border-amber-900/50 bg-amber-950/10 p-6">
        <div className="mb-4 border-b border-amber-900/30 pb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-200/90">
            Demo emails
          </h2>
          <p className="mt-1 text-xs text-amber-200/50">
            Sample messages only — not from your real inbox. Use this to preview
            summaries, scores, and drafts without Gmail.
          </p>
        </div>

        <button
          type="button"
          onClick={seedDemo}
          className="mb-6 rounded-lg bg-amber-900/40 px-4 py-2 text-sm font-medium text-amber-100 ring-1 ring-amber-800/50 hover:bg-amber-800/40"
        >
          Load demo emails
        </button>

        {demoEmails.length === 0 ? (
          <p className="text-sm text-slate-500">
            No demo emails loaded. Click the button above to insert samples.
          </p>
        ) : (
          <ul className="space-y-4">
            {demoEmails.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-1 -top-2 rounded bg-amber-900/80 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-100">
                  Demo
                </span>
                <EmailCard email={e} onClassify={classifyOne} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <BulkDeletePrompt
        groups={bulkGroups}
        onDeleted={refreshAll}
        userId={userId}
      />
      <UnsubscribePrompt
        subscriptions={subscriptions}
        onUpdated={refreshAll}
        userId={userId}
      />
    </div>
  );
}
