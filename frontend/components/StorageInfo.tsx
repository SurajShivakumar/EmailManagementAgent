"use client";

import { useEffect, useState } from "react";

interface StorageData {
  email: string;
  storageQuota: {
    available: boolean;
    limitGb: number;
    usageGb: number;
    percentUsed: number;
    usageInDriveGb: number;
    usageInDriveTrashGb: number;
    usageFromGoogleServicesGb: number;
  };
  storageWarning?: string | null;
  storageErrorCode?: "DRIVE_API_DISABLED" | "DRIVE_SCOPE_MISSING" | "UNKNOWN" | null;
  storageEnableUrl?: string | null;
}

export function StorageInfo() {
  const [storage, setStorage] = useState<StorageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStorageInfo();
  }, []);

  async function fetchStorageInfo() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gmail/storage");
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to fetch storage info");
      }
      const data = await res.json();
      setStorage(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
        <div className="text-xs text-[var(--muted)]">Loading stats…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
        <div className="text-xs text-red-300">Error loading storage info</div>
      </div>
    );
  }

  if (!storage) {
    return null;
  }

  const {
    email,
    storageQuota,
    storageWarning,
    storageErrorCode,
    storageEnableUrl,
  } = storage;

  const formatGB = (gb: number) => gb.toFixed(2);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-white text-sm">Storage & Stats</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">{email}</p>
        </div>
        <button
          onClick={fetchStorageInfo}
          className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Storage Quota */}
      <div className="border-t border-[var(--border)] pt-3">
        <h4 className="text-xs font-semibold text-slate-300 mb-3">
          Google Account Storage
        </h4>
        
        {storageQuota.available ? (
          <>
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-slate-100">
                  {formatGB(storageQuota.usageGb)} GB of {formatGB(storageQuota.limitGb)} GB used
                </span>
                <span className="text-xs text-slate-400">
                  {storageQuota.percentUsed}%
                </span>
              </div>
              <div className="w-full bg-slate-800/50 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-slate-400 to-slate-500 rounded-full transition-all"
                  style={{ width: `${Math.min(storageQuota.percentUsed, 100)}%` }}
                />
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span>Google Drive (API)</span>
                <span className="text-slate-400">{formatGB(storageQuota.usageInDriveGb)} GB</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>Drive Trash (API)</span>
                <span className="text-slate-400">{formatGB(storageQuota.usageInDriveTrashGb)} GB</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>Other Google services (API)</span>
                <span className="text-slate-400">{formatGB(storageQuota.usageFromGoogleServicesGb)} GB</span>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {storageErrorCode === "DRIVE_API_DISABLED" && (
              <div className="space-y-1">
                <p>Live storage quota unavailable because Google Drive API is disabled for this project.</p>
                {storageEnableUrl && (
                  <a
                    href={storageEnableUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-amber-100 underline underline-offset-2"
                  >
                    Enable Google Drive API
                  </a>
                )}
                <p>After enabling, wait 2-5 minutes and press Refresh.</p>
              </div>
            )}

            {storageErrorCode === "DRIVE_SCOPE_MISSING" && (
              <p>Live storage quota unavailable. Reconnect Gmail to grant Drive read access, then refresh.</p>
            )}

            {(!storageErrorCode || storageErrorCode === "UNKNOWN") && (
              <p>
                Live storage quota unavailable.
                {storageWarning ? ` ${storageWarning}` : ""}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
