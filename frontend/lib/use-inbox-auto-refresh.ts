"use client";

import { useEffect, useRef } from "react";

export function useInboxAutoRefresh({
  enabled,
  intervalMs,
  onRefresh,
}: {
  enabled: boolean;
  intervalMs: number;
  onRefresh: () => Promise<void>;
}) {
  const runningRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const refreshSafe = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        await onRefresh();
      } finally {
        runningRef.current = false;
      }
    };

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void refreshSafe();
    }, intervalMs);

    const onVisible = () => {
      if (!document.hidden) {
        void refreshSafe();
      }
    };

    void refreshSafe();

    window.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [enabled, intervalMs, onRefresh]);
}
