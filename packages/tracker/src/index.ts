/**
 * RapidShift Cookieless Web Analytics Tracker
 * Size: <2KB minified
 * Zero cookies, zero localStorage persistent tracking IDs.
 */

interface QueuedEvent {
  type: "pageview" | "event" | "vitals" | "error";
  path?: string;
  referrer?: string;
  sessionId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  browser?: string;
  os?: string;
  device?: string;
  metricName?: string;
  metricValue?: number;
  metricRating?: string;
  payload?: Record<string, any>;
  timestamp?: number;
}

(function () {
  if (typeof window === "undefined") return;

  // Extract config from script tag
  const script = document.currentScript as HTMLScriptElement | null;
  const clientId =
    script?.getAttribute("data-client-id") ||
    script?.getAttribute("data-key") ||
    (window as any).RSL_CLIENT_ID ||
    "";
  const endpoint =
    script?.getAttribute("data-endpoint") ||
    (window as any).RSL_ENDPOINT ||
    "/api/collect";

  // Ephemeral in-tab session ID (destroyed when tab closes, zero persistent tracking)
  let sessionId = "";
  try {
    sessionId = sessionStorage.getItem("_rsl_sid") || "";
    if (!sessionId) {
      sessionId = Math.random().toString(36).substring(2, 12);
      sessionStorage.setItem("_rsl_sid", sessionId);
    }
  } catch {
    sessionId = Math.random().toString(36).substring(2, 12);
  }

  // Parse UTM parameters
  function getUtm(): { source?: string; medium?: string; campaign?: string } {
    try {
      const p = new URLSearchParams(window.location.search);
      return {
        source: p.get("utm_source") || undefined,
        medium: p.get("utm_medium") || undefined,
        campaign: p.get("utm_campaign") || undefined,
      };
    } catch {
      return {};
    }
  }

  // Device & browser detection (pure client side hints)
  function getEnvironment() {
    const ua = navigator.userAgent;
    let browser = "Other";
    if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Edg")) browser = "Edge";
    else if (ua.includes("Chrome")) browser = "Chrome";
    else if (ua.includes("Safari")) browser = "Safari";

    let os = "Other";
    if (ua.includes("Windows")) os = "Windows";
    else if (ua.includes("Mac")) os = "macOS";
    else if (ua.includes("Linux")) os = "Linux";
    else if (ua.includes("Android")) os = "Android";
    else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";

    const device = /Mobi|Android|iPhone/i.test(ua) ? "mobile" : "desktop";

    return { browser, os, device };
  }

  const queue: QueuedEvent[] = [];
  let flushTimeout: any = null;

  function flush() {
    if (queue.length === 0 || !clientId) return;
    const batch = queue.splice(0, queue.length);
    const payload = JSON.stringify({
      clientId,
      events: batch,
    });

    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(endpoint, blob);
    } else {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  }

  function enqueue(event: QueuedEvent) {
    const env = getEnvironment();
    const utm = getUtm();

    queue.push({
      ...event,
      sessionId,
      path: event.path || window.location.pathname + window.location.search,
      referrer: (event.referrer ?? document.referrer) || undefined,
      browser: env.browser,
      os: env.os,
      device: env.device,
      utmSource: utm.source,
      utmMedium: utm.medium,
      utmCampaign: utm.campaign,
      timestamp: Date.now(),
    });

    if (!flushTimeout) {
      flushTimeout = setTimeout(() => {
        flushTimeout = null;
        flush();
      }, 500);
    }
  }

  // 1. Track pageview
  function trackPageview(path?: string) {
    enqueue({
      type: "pageview",
      path: path || window.location.pathname,
    });
  }

  // 2. Track custom event
  function trackEvent(name: string, payload?: Record<string, any>) {
    enqueue({
      type: "event",
      metricName: name,
      payload,
    });
  }

  // 3. Track Core Web Vitals
  function observeVitals() {
    if (typeof PerformanceObserver === "undefined") return;

    // FCP & LCP
    try {
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1] as any;
        if (lastEntry) {
          const val = Math.round(lastEntry.startTime);
          const rating = val > 4000 ? "poor" : val > 2500 ? "needs-improvement" : "good";
          enqueue({
            type: "vitals",
            metricName: "LCP",
            metricValue: val,
            metricRating: rating,
          });
        }
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}

    // CLS
    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries() as any[]) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        }
        const val = Math.round(clsValue * 1000);
        const rating = val > 250 ? "poor" : val > 100 ? "needs-improvement" : "good";
        enqueue({
          type: "vitals",
          metricName: "CLS",
          metricValue: val,
          metricRating: rating,
        });
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
    } catch {}

    // Navigation Timing (TTFB)
    try {
      window.addEventListener("load", () => {
        const navEntries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
        if (navEntries && navEntries[0]) {
          const nav = navEntries[0];
          const ttfb = Math.round(nav.responseStart - nav.requestStart);
          enqueue({
            type: "vitals",
            metricName: "TTFB",
            metricValue: ttfb,
            metricRating: ttfb > 800 ? "poor" : ttfb > 200 ? "needs-improvement" : "good",
          });
        }
      });
    } catch {}
  }

  // 4. Track unhandled JS errors
  function observeErrors() {
    window.addEventListener("error", (event) => {
      enqueue({
        type: "error",
        payload: {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    window.addEventListener("unhandledrejection", (event) => {
      enqueue({
        type: "error",
        payload: {
          message: event.reason?.message || String(event.reason),
        },
      });
    });
  }

  // 5. SPA navigation listeners
  function observeHistory() {
    let lastPath = window.location.pathname;

    const onNavigate = () => {
      const currentPath = window.location.pathname;
      if (currentPath !== lastPath) {
        lastPath = currentPath;
        trackPageview(currentPath);
      }
    };

    window.addEventListener("popstate", onNavigate);

    const origPushState = history.pushState;
    if (origPushState) {
      history.pushState = function (...args) {
        origPushState.apply(this, args);
        onNavigate();
      };
    }

    const origReplaceState = history.replaceState;
    if (origReplaceState) {
      history.replaceState = function (...args) {
        origReplaceState.apply(this, args);
        onNavigate();
      };
    }
  }

  // Initialize
  trackPageview();
  observeVitals();
  observeErrors();
  observeHistory();

  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);

  // Global API
  (window as any).rsl = {
    track: trackEvent,
    page: trackPageview,
    flush,
  };
})();
