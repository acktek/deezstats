"use client";

import { useEffect, useRef } from "react";

// Silently sync ESPN data when admin loads any page
// Won't sync more than once every 2 minutes to avoid hammering the API
export function AutoSync() {
  const hasSynced = useRef(false);

  useEffect(() => {
    if (hasSynced.current) return;

    const lastSyncKey = "deezstats_last_sync";
    const lastSync = localStorage.getItem(lastSyncKey);
    const twoMinutesAgo = Date.now() - 2 * 60 * 1000;

    // Only sync if we haven't synced in the last 2 minutes
    if (!lastSync || parseInt(lastSync) < twoMinutesAgo) {
      hasSynced.current = true;

      // Run sync in background
      fetch("/api/cron/sync-espn")
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            localStorage.setItem(lastSyncKey, Date.now().toString());
            console.log(`[AutoSync] Updated ${data.gamesUpdated} games, ${data.alertsCreated} alerts`);
          }
        })
        .catch((err) => {
          console.error("[AutoSync] Failed:", err);
        });
    }
  }, []);

  return null; // This component renders nothing
}
