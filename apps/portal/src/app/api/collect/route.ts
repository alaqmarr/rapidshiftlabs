import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@rsl/core/container";
import { analyticsIngestLimiter } from "@/lib/rate-limiter";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Publishable-Key",
};

const BOT_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /yandexbot/i,
  /baiduspider/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /rogerbot/i,
  /linkedinbot/i,
  /embedly/i,
  /quora link preview/i,
  /showyoubot/i,
  /outbrain/i,
  /pinterest\/0\./i,
  /developers\.google\.com\/\+\/web\/snippet/i,
  /slackbot/i,
  /vkshare/i,
  /w3c_validator/i,
  /redditbot/i,
  /applebot/i,
  /whatsapp/i,
  /flipboard/i,
  /tumblr/i,
  /bitlybot/i,
  /skypeuripreview/i,
  /nuzzel/i,
  /discordbot/i,
  /google page speed/i,
  /qwantify/i,
  /pinterestbot/i,
  /bitrix link preview/i,
  /xing-content/i,
  /chrome-lighthouse/i,
  /headlesschrome/i,
];

const TZ_COUNTRY_MAP: Record<string, string> = {
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Asia/Dubai": "AE",
  "Asia/Singapore": "SG",
  "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR",
  "Asia/Shanghai": "CN",
  "Asia/Hong_Kong": "HK",
  "Asia/Bangkok": "TH",
  "Asia/Jakarta": "ID",
  "Asia/Manila": "PH",
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Karachi": "PK",
  "Asia/Dhaka": "BD",
  "Asia/Colombo": "LK",
  "Asia/Kathmandu": "NP",
  "Asia/Riyadh": "SA",
  "Asia/Qatar": "QA",
  "Asia/Kuwait": "KW",
  "Asia/Jerusalem": "IL",
  "Europe/London": "GB",
  "Europe/Dublin": "IE",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Amsterdam": "NL",
  "Europe/Madrid": "ES",
  "Europe/Rome": "IT",
  "Europe/Zurich": "CH",
  "Europe/Stockholm": "SE",
  "Europe/Oslo": "NO",
  "Europe/Warsaw": "PL",
  "Europe/Lisbon": "PT",
  "Europe/Vienna": "AT",
  "Europe/Brussels": "BE",
  "Europe/Istanbul": "TR",
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Phoenix": "US",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "America/Sao_Paulo": "BR",
  "America/Mexico_City": "MX",
  "America/Buenos_Aires": "AR",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Perth": "AU",
  "Pacific/Auckland": "NZ",
  "Africa/Johannesburg": "ZA",
  "Africa/Lagos": "NG",
  "Africa/Cairo": "EG",
  "Africa/Nairobi": "KE",
};

function resolveCountryFromHints(tz?: unknown, lang?: unknown): string {
  if (typeof tz === "string" && tz.trim()) {
    const cleanTz = tz.trim();
    if (TZ_COUNTRY_MAP[cleanTz]) return TZ_COUNTRY_MAP[cleanTz]!;
  }
  if (typeof lang === "string" && lang.includes("-")) {
    const region = lang.split("-")[1]?.trim().toUpperCase();
    if (region && /^[A-Z]{2}$/.test(region)) return region;
  }
  return "IN";
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";

    // 1. Sliding window rate limiting per IP
    const rateLimit = analyticsIngestLimiter.hit(ip);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many analytics requests. Please back off." },
        {
          status: 429,
          headers: {
            ...CORS_HEADERS,
            "Retry-After": String(rateLimit.retryAfterSeconds),
            "X-RateLimit-Limit": String(rateLimit.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(rateLimit.resetTime),
          },
        },
      );
    }

    const userAgent = req.headers.get("user-agent") || "";

    // Bot filtering
    for (const pattern of BOT_PATTERNS) {
      if (pattern.test(userAgent)) {
        return NextResponse.json({ ok: true, ignored: "bot" }, { status: 200, headers: CORS_HEADERS });
      }
    }

    // 2. Payload size check (< 64 KB)
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 65_536) {
      return NextResponse.json(
        { error: "Payload too large (max 64KB)" },
        { status: 413, headers: CORS_HEADERS },
      );
    }

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400, headers: CORS_HEADERS });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Payload must be a JSON object" }, { status: 400, headers: CORS_HEADERS });
    }

    // 3. Resolve and validate client identification
    const container = getContainer();
    const candidateKey =
      req.headers.get("x-publishable-key") ||
      body.publishableKey ||
      body.key ||
      (typeof body.clientId === "string" && (body.clientId.startsWith("rpk_live_") || body.clientId.startsWith("rsk_live_"))
        ? body.clientId
        : null);

    let clientId: string | null = null;

    if (candidateKey) {
      // Validate cryptographically signed API/publishable key
      const keyRecord = await container.apiPlatformModule.validateApiKey(candidateKey);
      if (!keyRecord || !keyRecord.valid || !keyRecord.clientId) {
        return NextResponse.json(
          { error: `Invalid or revoked API key: ${keyRecord?.error || "unauthorized"}` },
          { status: 401, headers: CORS_HEADERS },
        );
      }
      clientId = keyRecord.clientId;

      // If body also specified a clientId, verify it matches the key's clientId
      if (body.clientId && !body.clientId.startsWith("rpk_") && !body.clientId.startsWith("rsk_")) {
        if (body.clientId !== clientId) {
          return NextResponse.json(
            { error: "Client ID mismatch with supplied API key" },
            { status: 403, headers: CORS_HEADERS },
          );
        }
      }
    } else if (typeof body.clientId === "string" && body.clientId.trim().length > 0) {
      const rawClientId = body.clientId.trim();
      // Verify client actually exists in tenant directory
      const existingClient = await container.clientDirectoryRepo.findById(rawClientId).catch(() => null);
      if (!existingClient) {
        return NextResponse.json(
          { error: "Client not found or unrecognized" },
          { status: 400, headers: CORS_HEADERS },
        );
      }

      // Check origin / referer domain binding if domains are registered for this client
      const origin = req.headers.get("origin") || req.headers.get("referer");
      if (origin) {
        try {
          const originHost = new URL(origin).hostname.toLowerCase();
          const monitored = await container.monitoredDomainRepo.findByClientId(rawClientId).catch(() => []);
          // If the client has registered monitored domains, ensure request matches registered host, first-party host, or localhost
          if (monitored && monitored.length > 0) {
            const allowedHosts = new Set(monitored.map((m: any) => m.hostname.toLowerCase()));
            const selfHost = (req.headers.get("host") || req.nextUrl.hostname || "").split(":")[0]?.toLowerCase();
            const isLocalOrSelf =
              originHost === "localhost" ||
              originHost === "127.0.0.1" ||
              (Boolean(selfHost) && originHost === selfHost);
            if (!isLocalOrSelf && !allowedHosts.has(originHost)) {
              console.warn(`[Ingest Spoof Guard] Rejected analytics from unapproved origin: ${originHost} for client ${rawClientId}`);
              return NextResponse.json(
                { error: "Origin domain not authorized for this client" },
                { status: 403, headers: CORS_HEADERS },
              );
            }
          }
        } catch {
          // malformed URL
        }
      }

      clientId = rawClientId;
    }

    if (!clientId) {
      return NextResponse.json(
        { error: "Missing or invalid client identifier. Provide a valid Publishable Key or Client ID." },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // 4. Validate event batch size and structure
    const rawEvents = Array.isArray(body.events) ? body.events : [body];
    if (rawEvents.length > 50) {
      return NextResponse.json(
        { error: "Batch size exceeds maximum limit of 50 events per request" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const headerCountry =
      req.headers.get("cf-ipcountry") ||
      req.headers.get("x-vercel-ip-country") ||
      req.headers.get("x-country-code") ||
      req.headers.get("x-geo-country") ||
      "";

    const events = rawEvents
      .filter((e: any) => e && typeof e === "object")
      .map((e: any) => {
        const payloadObj = e.payload && typeof e.payload === "object" ? e.payload : undefined;
        const resolvedCountry =
          (typeof e.country === "string" && e.country.trim()) ||
          (headerCountry && headerCountry !== "XX" ? headerCountry.trim().toUpperCase() : "") ||
          resolveCountryFromHints(payloadObj?.tz, payloadObj?.lang);

        return {
          type: typeof e.type === "string" ? e.type.slice(0, 32) : "event",
          path: typeof e.path === "string" ? e.path.slice(0, 512) : undefined,
          referrer: typeof e.referrer === "string" ? e.referrer.slice(0, 512) : undefined,
          sessionId: typeof e.sessionId === "string" ? e.sessionId.slice(0, 64) : undefined,
          utmSource: typeof e.utmSource === "string" ? e.utmSource.slice(0, 128) : undefined,
          utmMedium: typeof e.utmMedium === "string" ? e.utmMedium.slice(0, 128) : undefined,
          utmCampaign: typeof e.utmCampaign === "string" ? e.utmCampaign.slice(0, 128) : undefined,
          browser: typeof e.browser === "string" ? e.browser.slice(0, 64) : undefined,
          os: typeof e.os === "string" ? e.os.slice(0, 64) : undefined,
          device: typeof e.device === "string" ? e.device.slice(0, 32) : undefined,
          country: resolvedCountry ? resolvedCountry.slice(0, 64) : undefined,
          metricName: typeof e.metricName === "string" ? e.metricName.slice(0, 64) : undefined,
          metricValue: typeof e.metricValue === "number" && !isNaN(e.metricValue) ? e.metricValue : undefined,
          metricRating: typeof e.metricRating === "string" ? e.metricRating.slice(0, 32) : undefined,
          payload: payloadObj,
          timestamp: typeof e.timestamp === "number" && !isNaN(e.timestamp) ? e.timestamp : Date.now(),
        };
      });

    const result = await container.analytics.recordEventBatchUseCase.execute(
      {
        clientId,
        events,
      },
      { ip, userAgent },
    );

    return NextResponse.json(
      { ok: true, count: result.recordedCount },
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "X-RateLimit-Limit": String(rateLimit.limit),
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      },
    );
  } catch (err: any) {
    console.error("[Ingest API Error]", err);
    return NextResponse.json(
      { error: err?.message || "Internal Ingest Error" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
