"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/browser";

const editing = () => {
  const el = document.activeElement;
  return !!el && (el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el.tagName === "INPUT" && !["checkbox", "radio", "button", "submit"].includes((el as HTMLInputElement).type)));
};

/**
 * Keeps every open page current. The database pings the private "app" topic whenever anything
 * changes (no data in the ping); we then ask the server to re-render this page, so what you see
 * still comes through the server's role checks. Waits while you're typing or the tab is hidden.
 */
export function LiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stale = false;
    let hiddenAt = 0;
    const run = () => {
      if (document.visibilityState === "hidden" || editing()) { stale = true; return; }
      stale = false;
      router.refresh();
    };
    const ping = () => { clearTimeout(timer); timer = setTimeout(run, 400); };
    const onVisible = () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
      // Phones drop the connection while asleep: catch up when the app comes back.
      if (stale || Date.now() - hiddenAt > 30_000) ping();
    };
    const onBlur = () => { if (stale) ping(); };
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("focusout", onBlur);

    const sb = browserClient();
    let channel: ReturnType<typeof sb.channel> | undefined;
    let closed = false;
    (async () => {
      try {
        await sb.realtime.setAuth();
        if (closed) return;
        channel = sb.channel("app", { config: { private: true } })
          .on("broadcast", { event: "change" }, ping)
          .subscribe();
      } catch {
        // No live connection: the page still updates on navigation and when it comes back into view.
      }
    })();
    return () => {
      closed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("focusout", onBlur);
      if (channel) void sb.removeChannel(channel);
    };
  }, [router]);
  return null;
}
