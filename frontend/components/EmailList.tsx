"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailRow } from "@/lib/types";
import { EmailCard } from "@/components/EmailCard";
import { BulkDeletePrompt } from "@/components/BulkDeletePrompt";
import { UnsubscribePrompt } from "@/components/UnsubscribePrompt";
import { StorageInfo } from "@/components/StorageInfo";
import { useInboxAutoRefresh } from "@/lib/use-inbox-auto-refresh";
import { SmartInboxRow } from "@/components/SmartInboxRow";

type Group = {
  category: string;
  count: number;
  ids: string[];
  items: { id: string; subject: string; sender: string }[];
};

type Sub = {
  id: string;
  sender_email: string;
  sender_name: string | null;
  unsubscribed: boolean;
};

type GmailIdentity = {
  name: string;
  email: string;
  given_name?: string | null;
  family_name?: string | null;
  full_name?: string | null;
  picture?: string | null;
};

type Bootstrap = {
  userId: string | null;
  gmailConnected: boolean;
  gmailTokensWithoutBrowserSession: boolean;
  gmailOAuthReady: boolean;
  gmailIdentity: GmailIdentity | null;
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

  const userId = bootstrap?.userId ?? null;
  const qs = userQs(userId);
  const gmailConnected = bootstrap?.gmailConnected ?? false;
  const gmailTokensWithoutBrowserSession =
    bootstrap?.gmailTokensWithoutBrowserSession ?? false;
  const gmailOAuthReady = bootstrap?.gmailOAuthReady ?? false;
  const gmailIdentity = bootstrap?.gmailIdentity ?? null;

  const [gmailEmails, setGmailEmails] = useState<EmailRow[]>([]);
  const [demoEmails, setDemoEmails] = useState<EmailRow[]>([]);
  const [bulkGroups, setBulkGroups] = useState<Group[]>([]);
  const [subscriptions, setSubscriptions] = useState<Sub[]>([]);

  const [inboxSort, setInboxSort] = useState<"recent" | "smart">("recent");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showDemo, setShowDemo] = useState(false);
  const syncedOnceRef = useRef(false);
  const pipelineLockRef = useRef(false);
  const [appOrigin, setAppOrigin] = useState("http://localhost:3000");

  useEffect(() => {
    setAppOrigin(window.location.origin);
  }, []);

  const refreshBootstrapMeta = useCallback(async () => {
    const bootQs = qOverride
      ? `?userId=${encodeURIComponent(qOverride)}`
      : "";
    const res = await fetch(`/api/bootstrap${bootQs}`, {
      credentials: "include",
    });
    const j = await res.json();
    if (!res.ok) return;
    setBootstrap((prev) =>
      prev
        ? {
            ...prev,
            userId: (j.userId ?? null) as string | null,
            gmailConnected: Boolean(j.gmailConnected),
            gmailTokensWithoutBrowserSession: Boolean(
              j.gmailTokensWithoutBrowserSession,
            ),
            gmailOAuthReady: Boolean(j.gmailOAuthReady),
            gmailIdentity: (j.gmailIdentity ?? null) as GmailIdentity | null,
          }
        : null,
    );
  }, [qOverride]);

  const loadAlerts = useCallback(async () => {
    if (!userId) return;
    const res = await fetch(`/api/emails${qs}`, { credentials: "include" });
    const j = await res.json();
    if (!res.ok) return;
    setBulkGroups(j.bulkGroups ?? []);
    setSubscriptions(j.subscriptions ?? []);
  }, [userId, qs]);

  const loadGmailPick = useCallback(async () => {
    if (!userId) return;
    const sep = qs.includes("?") ? "&" : "?";
    const res = await fetch(
      `/api/emails${qs}${sep}mode=gmail_recent&limit=100`,
      { credentials: "include" },
    );
    const j = await res.json();
    if (!res.ok) return;
    const list = (j.emails ?? []) as EmailRow[];
    setGmailEmails(list.filter((e) => e.status !== "deleted"));
  }, [userId, qs]);

  const loadDemo = useCallback(async () => {
    if (!userId) return;
    const sep = qs ? "&" : "?";
    const res = await fetch(`/api/emails${qs}${sep}mode=demo`, {
      credentials: "include",
    });
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
    async (opts?: { maxResults?: number; resetBeforeSync?: boolean }) => {
      if (!userId) return;
      const maxResults = opts?.maxResults ?? 25;
      const resetBeforeSync = Boolean(opts?.resetBeforeSync);
      setSyncing(true);
      setSyncError(null);
      try {
        const res = await fetch("/api/gmail/sync", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, maxResults, resetBeforeSync }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j.error as string) ?? "Sync failed");
        }
        await refreshAll();
      } catch (e) {
        setSyncError(e instanceof Error ? e.message : "Sync failed");
      } finally {
        setSyncing(false);
      }
    },
    [userId, refreshAll],
  );

  const runInboxPipeline = useCallback(async () => {
    if (!userId || !gmailConnected) return;
    if (pipelineLockRef.current) return;
    pipelineLockRef.current = true;
    setSyncing(true);
    setSyncError(null);
    try {
      const syncRes = await fetch("/api/gmail/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, maxResults: 50 }),
      });
      if (!syncRes.ok) {
        const j = await syncRes.json().catch(() => ({}));
        const msg = (j.error as string) ?? "Sync failed";
        setSyncError(msg);
        console.warn(msg);
      }
      const reproRes = await fetch("/api/emails/reprocess", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!reproRes.ok) {
        const j = await reproRes.json().catch(() => ({}));
        const msg = (j.error as string) ?? "Reprocess failed";
        setSyncError((prev) => prev ?? msg);
        console.warn(msg);
      }
      if (syncRes.ok && reproRes.ok) setSyncError(null);
      await refreshAll();
      await refreshBootstrapMeta();
    } finally {
      pipelineLockRef.current = false;
      setSyncing(false);
    }
  }, [userId, gmailConnected, refreshAll, refreshBootstrapMeta]);

  useEffect(() => {
    (async () => {
      setBootErr(null);
      const bootQs = qOverride
        ? `?userId=${encodeURIComponent(qOverride)}`
        : "";
      const res = await fetch(`/api/bootstrap${bootQs}`, {
        credentials: "include",
      });
      const j = await res.json();
      if (!res.ok) {
        setBootErr(j.error ?? "Bootstrap failed");
        setLoading(false);
        return;
      }
      setBootstrap({
        userId: (j.userId ?? null) as string | null,
        gmailConnected: Boolean(j.gmailConnected),
        gmailTokensWithoutBrowserSession: Boolean(
          j.gmailTokensWithoutBrowserSession,
        ),
        gmailOAuthReady: Boolean(j.gmailOAuthReady),
        gmailIdentity: (j.gmailIdentity ?? null) as GmailIdentity | null,
      });
      setLoading(false);
    })();
  }, [qOverride]);

  useEffect(() => {
    if (!userId) return;
    if (gmailConnected) return;
    void refreshAll();
  }, [userId, gmailConnected, refreshAll]);

  useEffect(() => {
    if (!userId || !gmailConnected) return;

    const oauthReturn = search.get("gmail") === "connected";
    const tail = qOverride ? `?userId=${encodeURIComponent(qOverride)}` : "";

    const run = async () => {
      await runInboxPipeline();
      if (oauthReturn) router.replace(`/${tail}`);
    };

    if (oauthReturn) {
      syncedOnceRef.current = true;
      void run();
      return;
    }

    if (!syncedOnceRef.current) {
      syncedOnceRef.current = true;
      void run();
    }
  }, [
    userId,
    gmailConnected,
    search,
    runInboxPipeline,
    router,
    qOverride,
  ]);

  useEffect(() => {
    if (!userId || !gmailConnected) return;
    const id = window.setInterval(
      () => void runInboxPipeline(),
      4 * 60 * 1000,
    );
    return () => window.clearInterval(id);
  }, [userId, gmailConnected, runInboxPipeline]);

  useEffect(() => {
    if (!userId || !gmailConnected) return;
    const onVis = () => {
      if (document.visibilityState === "visible") void runInboxPipeline();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [userId, gmailConnected, runInboxPipeline]);

  const gmailEmailsNewestFirst = useMemo(() => {
    return [...gmailEmails].sort((a, b) => {
      const ta = a.received_at ? new Date(a.received_at).getTime() : 0;
      const tb = b.received_at ? new Date(b.received_at).getTime() : 0;
      return tb - ta;
    });
  }, [gmailEmails]);

  const gmailEmailsByPriority = useMemo(() => {
    return [...gmailEmails].sort((a, b) => {
      const pa = a.priority_score ?? 0;
      const pb = b.priority_score ?? 0;
      if (pb !== pa) return pb - pa;
      const ta = a.received_at ? new Date(a.received_at).getTime() : 0;
      const tb = b.received_at ? new Date(b.received_at).getTime() : 0;
      return tb - ta;
    });
  }, [gmailEmails]);

  async function seedDemo() {
    if (!userId) return;
    const res = await fetch("/api/emails/seed", {
      method: "POST",
      credentials: "include",
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
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailId: id, is_reply_to_sent: false, userId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Re-run failed");
      return;
    }
    await refreshAll();
  }

  async function disconnectGmail() {
    const res = await fetch("/api/auth/gmail/disconnect", {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Could not disconnect Gmail");
      return;
    }
    setBootstrap((prev) => (prev ? { ...prev, gmailConnected: false } : prev));
    setGmailEmails([]);
    router.replace("/");
  }

  const autoRefreshEnabled = Boolean(userId && gmailConnected);
  const autoRefreshInbox = useCallback(async () => {
    await syncGmailInbox({ maxResults: 25 });
  }, [syncGmailInbox]);

  useInboxAutoRefresh({
    enabled: autoRefreshEnabled,
    intervalMs: 15000,
    onRefresh: autoRefreshInbox,
  });

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

  if (!bootstrap) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-slate-400">
        Loading…
      </div>
    );
  }

  const signInHref = "/api/auth/gmail";

  if (!userId) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200">
        <header className="border-b border-slate-800/80 bg-slate-900/50 px-4 py-4">
          <h1 className="text-center text-lg font-semibold text-white">
            Email Management Agent
          </h1>
        </header>
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-sm uppercase tracking-wide text-slate-500">
            Not signed in
          </p>
          <p className="mt-3 text-sm text-slate-400">
            Sign in with Google to link Gmail to this browser. Your inbox stays
            private until you complete sign-in.
          </p>
          {gmailOAuthReady ? (
            <a
              href={signInHref}
              className="mt-8 inline-flex rounded-xl bg-blue-600 px-8 py-3 text-base font-medium text-white shadow-lg shadow-blue-900/30 hover:bg-blue-500"
            >
              Sign in to Gmail
            </a>
          ) : (
            <p className="mt-8 text-xs text-slate-500">
              Add Google OAuth variables to{" "}
              <code className="text-slate-400">frontend/.env.local</code> and
              restart the dev server.
            </p>
          )}
        </div>
      </div>
    );
  }

  const gmailSetupHint =
    search.get("gmail_setup") === "1" || search.get("gmail_error");
  const gmailErrorRaw = search.get("gmail_error");

  function dismissGmailQueryParams() {
    const tail = qOverride ? `?userId=${encodeURIComponent(qOverride)}` : "";
    router.replace(`/${tail}`);
  }

  const displayEmail = gmailIdentity?.email?.trim() || null;
  const displayName = (() => {
    const full =
      gmailIdentity?.full_name?.trim() ||
      [gmailIdentity?.given_name, gmailIdentity?.family_name]
        .filter(Boolean)
        .join(" ")
        .trim();
    if (full) return full;
    const n = gmailIdentity?.name?.trim();
    if (n && !n.includes("@")) return n;
    const g = gmailIdentity?.given_name?.trim();
    if (g) return g;
    if (n) return n;
    if (displayEmail) return displayEmail.split("@")[0] || displayEmail;
    return "Account";
  })();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="border-b border-slate-800/80 bg-slate-900/50 px-4 py-3">
        <div className="mx-auto flex max-w-[1600px] items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Logged in as
            </p>
            <p className="truncate text-sm font-semibold text-white">
              {displayName}
            </p>
            {displayEmail ? (
              <p className="truncate text-xs text-slate-400">{displayEmail}</p>
            ) : (
              <p className="text-xs text-slate-500">
                {gmailConnected
                  ? "Profile loading…"
                  : gmailTokensWithoutBrowserSession
                    ? "Sign in to Gmail on this browser to load your inbox"
                    : "Sign in to Gmail to show your Google account"}
              </p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
              {gmailConnected && (
                <a
                  href="/api/auth/gmail-signout"
                  className="underline hover:text-slate-400"
                >
                  Sign out of Gmail
                </a>
              )}
              <a
                href="/api/auth/clear-session"
                className="underline hover:text-slate-400"
              >
                Wrong account? Clear app session
              </a>
            </div>
          </div>
          <h1 className="hidden shrink-0 text-center text-base font-semibold tracking-tight text-white sm:block sm:pt-1 md:text-lg">
            Email Management Agent
          </h1>
          <div className="flex flex-1 justify-end pt-0.5">
            <button
              type="button"
              onClick={() => setShowDemo((v) => !v)}
              className="rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700/80"
            >
              {showDemo ? "Hide demo emails" : "Demo emails"}
            </button>
          </div>
        </div>
        <h1 className="mx-auto mt-2 max-w-[1600px] border-t border-slate-800/60 pt-2 text-center text-base font-semibold text-white sm:hidden">
          Email Management Agent
        </h1>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-6">
        <p className="mb-6 text-center text-sm text-slate-500">
          AI-ranked Gmail with summaries — backed by InsForge.
          {syncing && (
            <span className="ml-2 text-sky-400/90">Syncing inbox…</span>
          )}
        </p>
        {syncError && (
          <p className="mb-4 text-center text-sm text-red-400/90">{syncError}</p>
        )}

        {gmailConnected && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/80 bg-slate-900/40 px-4 py-3">
            <p className="text-xs text-slate-400">
              Manual refresh and disconnect. Background sync also runs on a timer.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void syncGmailInbox({ maxResults: 25 })}
                disabled={syncing}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-50"
              >
                {syncing ? "Refreshing…" : "Refresh inbox"}
              </button>
              <button
                type="button"
                onClick={() => void disconnectGmail()}
                className="rounded-lg border border-red-800/70 bg-red-950/40 px-3 py-2 text-xs font-medium text-red-100 hover:bg-red-900/40"
              >
                Disconnect Gmail
              </button>
            </div>
          </div>
        )}

        {gmailTokensWithoutBrowserSession &&
          !gmailConnected &&
          gmailOAuthReady && (
            <div className="mb-6 rounded-xl border border-sky-800/60 bg-sky-950/30 p-4 text-sm text-sky-100/90">
              <p className="font-medium text-sky-50">
                Gmail isn’t active in this browser
              </p>
              <p className="mt-2 text-xs text-sky-200/80">
                Sign in to Gmail here so this session can sync your inbox.
              </p>
              <a
                href={signInHref}
                className="mt-3 inline-flex rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white hover:bg-sky-500"
              >
                Sign in to Gmail
              </a>
            </div>
          )}

        {(gmailSetupHint || !gmailOAuthReady) && !gmailConnected && (
          <div className="mb-8 rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 text-sm text-amber-100/90">
            <p className="font-medium text-amber-50">
              Gmail sign-in needs Google OAuth credentials
            </p>
            <p className="mt-2 text-xs text-amber-200/70">
              Add these to{" "}
              <code className="rounded bg-black/30 px-1">frontend/.env.local</code>,
              then restart{" "}
              <code className="rounded bg-black/30 px-1">npm run dev</code>:
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
                <code className="rounded bg-black/30 px-1">GMAIL_REDIRECT_URI</code> in{" "}
                <code className="rounded bg-black/30 px-1">.env.local</code>.
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

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          <main className="min-w-0 flex-1 lg:max-w-none">
            {!gmailConnected ? (
              <div className="mb-10 flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/30 py-12">
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
                    ? "Allow Gmail access to sync your inbox, draft replies, and send from the app."
                    : "Configure Google OAuth in .env.local (see above) to enable this button."}
                </p>
              </div>
            ) : (
              <section className="rounded-2xl border border-slate-700/80 bg-slate-900/40 p-5 md:p-6">
                <h2 className="text-lg font-medium text-white">Your Gmail</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Smart inbox sorts by AI score; Recent is newest first. Open an email
                  to read the full message.
                </p>

                <div className="mt-4">
                  <label className="block max-w-xs text-sm text-slate-400">
                    <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
                      Inbox view
                    </span>
                    <select
                      className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={inboxSort}
                      onChange={(e) =>
                        setInboxSort(
                          e.target.value === "smart" ? "smart" : "recent",
                        )
                      }
                    >
                      <option value="recent">Recent (newest first)</option>
                      <option value="smart">Smart inbox (priority first)</option>
                    </select>
                  </label>
                </div>

                {loading && !syncing && (
                  <p className="mt-3 text-xs text-slate-500">Loading…</p>
                )}

                {inboxSort === "recent" && gmailEmailsNewestFirst.length > 0 ? (
                  <ul className="mt-6 space-y-4">
                    {gmailEmailsNewestFirst.map((e) => (
                      <li key={e.id}>
                        <EmailCard
                          email={e}
                          userId={userId}
                          gmailConnected={gmailConnected}
                          variant="recent"
                        />
                      </li>
                    ))}
                  </ul>
                ) : inboxSort === "smart" &&
                  gmailEmailsByPriority.length > 0 ? (
                  <ul className="mt-6 space-y-3">
                    {gmailEmailsByPriority.map((e) => (
                      <li key={e.id}>
                        <SmartInboxRow
                          email={e}
                          userId={userId}
                          gmailConnected={gmailConnected}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  gmailConnected &&
                  !loading &&
                  !syncing && (
                    <p className="mt-6 text-sm text-slate-500">
                      No synced Gmail messages yet. Use Refresh inbox or wait for sync.
                    </p>
                  )
                )}

                <div className="mt-8 border-t border-slate-800/80 pt-6">
                  <StorageInfo />
                </div>
              </section>
            )}

            {showDemo && (
              <section className="mt-8 rounded-2xl border border-dashed border-amber-900/50 bg-amber-950/10 p-6">
                <div className="mb-4 border-b border-amber-900/30 pb-4">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-200/90">
                    Demo emails
                  </h2>
                  <p className="mt-1 text-xs text-amber-200/50">
                    Sample messages — not from your real inbox.
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
                        <EmailCard
                          email={e}
                          userId={userId}
                          gmailConnected={false}
                          onClassify={classifyOne}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </main>

          <aside className="w-full shrink-0 space-y-6 lg:w-80 xl:w-96">
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
          </aside>
        </div>
      </div>
    </div>
  );
}
