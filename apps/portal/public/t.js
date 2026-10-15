/**
 * RapidShift Cookieless Web Analytics Tracker (t.js)
 * Size: <3KB
 * Privacy-first: zero third-party cookies. Captures pageviews, session journeys,
 * repeat-visit frequency, timezone/locale geo hints, referrers, UTMs, Core Web Vitals, and runtime errors.
 */
(function () {
  if (typeof window === "undefined") return;
  var script =
    document.currentScript ||
    document.querySelector(
      'script[data-client],script[data-client-id],script[data-key],script[src*="/t.js"]'
    );
  var clientId =
    (script &&
      (script.getAttribute("data-client") ||
        script.getAttribute("data-client-id") ||
        script.getAttribute("data-key"))) ||
    window.RSL_CLIENT_ID ||
    "";
  var defaultEndpoint = "/api/collect";
  try {
    if (script && script.src) {
      defaultEndpoint = new URL("/api/collect", script.src).href;
    }
  } catch (e) {}
  var endpoint =
    (script && script.getAttribute("data-endpoint")) ||
    window.RSL_ENDPOINT ||
    defaultEndpoint;

  // Ephemeral tab session + first-party repeat visit counter (no cookies)
  var sessionId = "";
  var isNewSession = false;
  var visitCount = 1;
  try {
    sessionId = sessionStorage.getItem("_rsl_sid") || "";
    if (!sessionId) {
      sessionId = "ses_" + Math.random().toString(36).substring(2, 12);
      sessionStorage.setItem("_rsl_sid", sessionId);
      isNewSession = true;
    }
    var rawVc = parseInt(localStorage.getItem("_rsl_vc") || "0", 10) || 0;
    if (isNewSession || rawVc === 0) {
      visitCount = rawVc + 1;
      localStorage.setItem("_rsl_vc", String(visitCount));
      localStorage.setItem("_rsl_last_seen", String(Date.now()));
    } else {
      visitCount = rawVc;
    }
  } catch (e) {
    sessionId = "ses_" + Math.random().toString(36).substring(2, 12);
  }

  function getUtm() {
    try {
      var p = new URLSearchParams(window.location.search);
      return {
        source: p.get("utm_source") || void 0,
        medium: p.get("utm_medium") || void 0,
        campaign: p.get("utm_campaign") || void 0,
      };
    } catch (e) {
      return {};
    }
  }

  function getEnv() {
    var ua = navigator.userAgent || "";
    var b = "Other";
    if (ua.indexOf("Firefox") > -1) b = "Firefox";
    else if (ua.indexOf("Edg") > -1) b = "Edge";
    else if (ua.indexOf("OPR") > -1 || ua.indexOf("Opera") > -1) b = "Opera";
    else if (ua.indexOf("Chrome") > -1) b = "Chrome";
    else if (ua.indexOf("Safari") > -1) b = "Safari";

    var os = "Other";
    if (ua.indexOf("Windows") > -1) os = "Windows";
    else if (ua.indexOf("Android") > -1) os = "Android";
    else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
    else if (ua.indexOf("Mac") > -1) os = "macOS";
    else if (ua.indexOf("Linux") > -1) os = "Linux";

    var dev = "desktop";
    if (/iPad|Tablet/i.test(ua)) dev = "tablet";
    else if (/Mobi|Android|iPhone|iPod/i.test(ua)) dev = "mobile";

    var tz = "";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (e) {}

    var lang = navigator.language || "";
    var screenRes =
      window.screen && window.screen.width
        ? window.screen.width + "x" + window.screen.height
        : "";

    return {
      browser: b,
      os: os,
      device: dev,
      tz: tz,
      lang: lang,
      screen: screenRes,
    };
  }

  var queue = [];
  var timer = null;

  function flush() {
    if (!queue.length || !clientId) return;
    var batch = queue.splice(0, queue.length);
    var payload = JSON.stringify({ clientId: clientId, events: batch });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        endpoint,
        new Blob([payload], { type: "application/json" })
      );
    } else {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(function () {});
    }
  }

  function enqueue(e) {
    var env = getEnv();
    var utm = getUtm();
    e.sessionId = sessionId;
    e.path = e.path || window.location.pathname + window.location.search;
    e.referrer =
      e.referrer != null ? e.referrer : document.referrer || void 0;
    e.browser = env.browser;
    e.os = env.os;
    e.device = env.device;
    e.utmSource = utm.source;
    e.utmMedium = utm.medium;
    e.utmCampaign = utm.campaign;
    e.payload = Object.assign(
      {
        title: typeof document !== "undefined" ? document.title : "",
        tz: env.tz,
        lang: env.lang,
        screen: env.screen,
        visitCount: visitCount,
        isRepeat: visitCount > 1,
      },
      e.payload || {}
    );
    e.timestamp = Date.now();
    queue.push(e);
    if (!timer) {
      timer = setTimeout(function () {
        timer = null;
        flush();
      }, 400);
    }
  }

  function page(p) {
    enqueue({
      type: "pageview",
      path: p || window.location.pathname + window.location.search,
    });
  }

  function track(n, pl) {
    enqueue({ type: "event", metricName: n, payload: pl });
  }

  function vitals() {
    if (typeof PerformanceObserver === "undefined") return;
    try {
      new PerformanceObserver(function (l) {
        var es = l.getEntries();
        var last = es[es.length - 1];
        if (last) {
          var v = Math.round(last.startTime);
          enqueue({
            type: "vitals",
            metricName: "LCP",
            metricValue: v,
            metricRating:
              v > 4000 ? "poor" : v > 2500 ? "needs-improvement" : "good",
          });
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch (e) {}

    try {
      new PerformanceObserver(function (l) {
        var es = l.getEntries();
        for (var i = 0; i < es.length; i++) {
          if (es[i].name === "first-contentful-paint") {
            var v = Math.round(es[i].startTime);
            enqueue({
              type: "vitals",
              metricName: "FCP",
              metricValue: v,
              metricRating:
                v > 3000 ? "poor" : v > 1800 ? "needs-improvement" : "good",
            });
          }
        }
      }).observe({ type: "paint", buffered: true });
    } catch (e) {}

    try {
      var cls = 0;
      new PerformanceObserver(function (l) {
        var es = l.getEntries();
        for (var i = 0; i < es.length; i++) {
          if (!es[i].hadRecentInput) cls += es[i].value;
        }
        var v = Math.round(cls * 1000);
        enqueue({
          type: "vitals",
          metricName: "CLS",
          metricValue: v,
          metricRating:
            v > 250 ? "poor" : v > 100 ? "needs-improvement" : "good",
        });
      }).observe({ type: "layout-shift", buffered: true });
    } catch (e) {}

    try {
      new PerformanceObserver(function (l) {
        var es = l.getEntries();
        var last = es[es.length - 1];
        if (last && typeof last.duration === "number") {
          var v = Math.round(last.duration);
          enqueue({
            type: "vitals",
            metricName: "INP",
            metricValue: v,
            metricRating:
              v > 500 ? "poor" : v > 200 ? "needs-improvement" : "good",
          });
        }
      }).observe({ type: "first-input", buffered: true });
    } catch (e) {}

    try {
      var sendTtfb = function () {
        var n = performance.getEntriesByType("navigation")[0];
        if (n && n.responseStart > 0) {
          var t = Math.max(1, Math.round(n.responseStart - n.requestStart));
          enqueue({
            type: "vitals",
            metricName: "TTFB",
            metricValue: t,
            metricRating:
              t > 800 ? "poor" : t > 200 ? "needs-improvement" : "good",
          });
        }
      };
      if (document.readyState === "complete") sendTtfb();
      else window.addEventListener("load", sendTtfb);
    } catch (e) {}
  }

  function errors() {
    window.addEventListener("error", function (e) {
      enqueue({
        type: "error",
        metricName: e.message ? String(e.message).slice(0, 120) : "RuntimeError",
        payload: { message: e.message, file: e.filename, line: e.lineno },
      });
    });
    window.addEventListener("unhandledrejection", function (e) {
      var msg =
        e.reason && e.reason.message ? e.reason.message : String(e.reason);
      enqueue({
        type: "error",
        metricName: String(msg).slice(0, 120),
        payload: { message: msg },
      });
    });
  }

  function history() {
    var lp = window.location.pathname + window.location.search;
    function onNav() {
      var cp = window.location.pathname + window.location.search;
      if (cp !== lp) {
        lp = cp;
        page(cp);
      }
    }
    window.addEventListener("popstate", onNav);
    var ps = window.history.pushState;
    if (ps) {
      window.history.pushState = function () {
        ps.apply(this, arguments);
        onNav();
      };
    }
    var rs = window.history.replaceState;
    if (rs) {
      window.history.replaceState = function () {
        rs.apply(this, arguments);
        onNav();
      };
    }
  }

  page();
  vitals();
  errors();
  history();
  window.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
  window.rsl = { track: track, page: page, flush: flush };
})();
