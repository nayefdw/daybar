"use client";
// "Daybar has been updated – Reload": the server runs a newer build than
// this page. Every answer names the server's build (lib/stale-copy.ts
// noticeBuild compares it with the page's and fires STALE_BUILD_EVENT);
// the app also asks the health check when it comes back to the front and
// every ten minutes while it is visible, so an idle window notices too.
// Right after loading, the page's own repair script reloads by itself
// (START_WINDOW); later, this toast offers it, once per page.
import { useEffect } from "react";
import { START_WINDOW, STALE_BUILD_EVENT, noticeBuild } from "@/lib/stale-copy";
import { tr } from "@/lib/locale-tag";
import { showToast } from "../toast";

const EVERY = 10 * 60_000;

export function useUpdateNotice() {
  useEffect(() => {
    const opened = Date.now();
    let shown = false;
    const offer = () => {
      if (shown || Date.now() - opened < START_WINDOW) return;
      shown = true;
      showToast({
        text: tr("Daybar wurde aktualisiert", "Daybar has been updated"),
        detail: tr("Neu laden, um die neue Version zu nutzen", "Reload to use the new version"),
        tone: "info",
        duration: 24 * 60 * 60_000,
        action: { label: tr("Neu laden", "Reload"), run: () => location.reload() },
      });
    };
    const ask = () => {
      if (shown || document.visibilityState !== "visible" || navigator.onLine === false) return;
      void fetch(`/api/health?update=${Date.now()}`, { cache: "no-store", credentials: "omit" })
        .then((response) => {
          noticeBuild(response.headers);
          void response.body?.cancel().catch(() => undefined);
        })
        .catch(() => undefined);
    };
    window.addEventListener(STALE_BUILD_EVENT, offer);
    document.addEventListener("visibilitychange", ask);
    const timer = setInterval(ask, EVERY);
    return () => {
      window.removeEventListener(STALE_BUILD_EVENT, offer);
      document.removeEventListener("visibilitychange", ask);
      clearInterval(timer);
    };
  }, []);
}
