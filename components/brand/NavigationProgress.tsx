"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import WazenPageLoader from "./WazenPageLoader";

function NavigationProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const pendingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeKey = `${pathname}?${searchParams?.toString() ?? ""}`;

  const stopTick = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const start = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    pendingRef.current = true;
    stopTick();
    setActive(true);
    setProgress(12);
    timerRef.current = setInterval(() => {
      setProgress((current) => {
        if (current >= 88) return current;
        const step = current < 40 ? 9 : current < 70 ? 4 : 1.5;
        return Math.min(88, current + step);
      });
    }, 180);
  };

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as Element | null;
      const anchor = target?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        if (url.hash) return;
      }

      start();
    };

    const onPopState = () => start();

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      stopTick();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!pendingRef.current) return;
    pendingRef.current = false;
    stopTick();
    setProgress(100);
    hideTimerRef.current = setTimeout(() => {
      setActive(false);
      setProgress(0);
      hideTimerRef.current = null;
    }, 280);
  }, [routeKey]);

  if (!active) return null;

  return (
    <WazenPageLoader
      overlay
      compact
      progress={progress}
      label="جاري تحميل الصفحة…"
    />
  );
}

/** Global soft-navigation indicator with official logo + filling heart. */
export default function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  );
}
