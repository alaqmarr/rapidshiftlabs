/**
 * OpenAPI 3.1.0 Specification for the RapidShift Control Plane
 * Covers 100% of public and administrative REST API routes with request/response schemas,
 * error envelopes, parameters, and examples.
 */

export interface OpenApiParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema: Record<string, any>;
  example?: any;
}

export interface OpenApiOperation {
  summary: string;
  description: string;
  operationId: string;
  tags: string[];
  parameters?: OpenApiParameter[];
  security?: Array<Record<string, string[]>>;
  requestBody?: {
    required?: boolean;
    description?: string;
    content: {
      "application/json": {
        schema: Record<string, any>;
        example?: any;
      };
    };
  };
  responses: Record<
    string,
    {
      description: string;
      content?: {
        "application/json"?: {
          schema: Record<string, any>;
          example?: any;
        };
        "application/pdf"?: {
          schema: Record<string, any>;
        };
        "text/event-stream"?: {
          schema: Record<string, any>;
        };
      };
    }
  >;
}

export type OpenApiPathItem = {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  delete?: OpenApiOperation;
  patch?: OpenApiOperation;
};

export interface OpenApiSpec {
  openapi: "3.1.0";
  info: {
    title: string;
    version: string;
    description: string;
    contact?: {
      name: string;
      url: string;
      email: string;
    };
    license?: {
      name: string;
      url: string;
    };
  };
  servers: Array<{
    url: string;
    description: string;
  }>;
  tags: Array<{
    name: string;
    description: string;
  }>;
  paths: Record<string, OpenApiPathItem>;
  components: {
    securitySchemes: Record<string, any>;
    schemas: Record<string, any>;
  };
}

const standardErrorSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string", example: "unauthorized" },
        message: { type: "string", example: "Authentication required or invalid credentials" },
      },
    },
  },
};

export const openApiSpec: OpenApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "RapidShift Control Plane API",
    version: "1.0.0",
    description:
      "Production REST API reference for RapidShift Labs: client access gating, billing, server & PM2 fleet management, domain monitoring, support desk, cookieless analytics, credential vault, and administration.",
    contact: {
      name: "RapidShift Labs Engineering",
      url: "https://rapidshiftlabs.com",
      email: "support@rapidshiftlabs.com",
    },
    license: {
      name: "Proprietary",
      url: "https://rapidshiftlabs.com/terms",
    },
  },
  servers: [
    {
      url: "https://api.rapidshiftlabs.com",
      description: "Production API Gateway",
    },
    {
      url: "http://localhost:3000",
      description: "Local Development Server",
    },
  ],
  tags: [
    { name: "System Health", description: "Health check and liveness probes" },
    { name: "Access Gate", description: "High-throughput client entitlement access gate and passes" },
    { name: "Analytics", description: "Cookieless visitor analytics, Core Web Vitals, exports, and offload" },
    { name: "Realtime Stream", description: "Server-Sent Events (SSE) live updates" },
    { name: "Embed Tokens", description: "Short-lived scoped tokens for Preact web components" },
    { name: "Billing & Invoices", description: "Invoices, contract status, and PDF downloads" },
    { name: "Fleet Operations", description: "Server telemetry, PM2 process discovery, restart, and logs" },
    { name: "Domain Monitoring", description: "HTTP uptime, TLS/SSL certificates, DNS drift, and RDAP registration" },
    { name: "Support Desk", description: "24x7 SLA support tickets, replies, escalation, and CSAT" },
    { name: "Credentials Vault", description: "AES-256-GCM encrypted secrets with audited reveal operations" },
    { name: "Releases", description: "Beta builds, staging URLs, and artifact distribution" },
    { name: "API Keys", description: "Client API key generation, scoping, and revocation" },
    { name: "Admin Clients", description: "Admin tenant and client directory management" },
    { name: "Admin Contracts", description: "Contract lifecycle, tenure, amounts, and activation" },
    { name: "Admin Invoices", description: "Invoice issuance, line items, and GST calculations" },
    { name: "Admin Payments", description: "Payment recording and balance settlement" },
    { name: "Admin Servers", description: "Server registry, SSH configuration, and process mapping" },
    { name: "Admin Domains", description: "Monitored domains configuration and manual checks" },
    { name: "Admin Entitlements", description: "Manual client entitlement overrides" },
    { name: "Admin Settings", description: "Firm legal details, GSTIN, bank details, and SMTP setup" },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "Authorization",
        description: "Bearer secret API key (`Bearer rsk_...`) or raw key in `X-Api-Key` header.",
      },
      PublishableKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-Publishable-Key",
        description: "Publishable API key (`rpk_...`) for browser ingestion.",
      },
      SessionAuth: {
        type: "apiKey",
        in: "cookie",
        name: "authjs.session-token",
        description: "NextAuth v5 session cookie for authenticated portal and admin sessions.",
      },
    },
    schemas: {
      ErrorEnvelope: standardErrorSchema,
      HealthStatus: {
        type: "object",
        properties: {
          status: { type: "string", example: "ok" },
          service: { type: "string", example: "rapidshift-control-plane" },
          uptime: { type: "number", example: 1420.5 },
          timestamp: { type: "integer", example: 1773177600000 },
          database: { type: "string", example: "healthy" },
        },
      },
      GateStatusResponse: {
        type: "object",
        properties: {
          data: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["allowed", "blocked"], example: "allowed" },
              allowed: { type: "boolean", example: true },
              state: { type: "string", enum: ["active", "overdue", "blocked", "suspended"], example: "active" },
              rapidshiftStatus: { type: "string", example: "online" },
              token: { type: "string", example: "eyJhbGciOiJFZERTQ..." },
              client: {
                type: "object",
                properties: {
                  id: { type: "string", example: "cli_01HQXYZ123456789" },
                },
              },
              cachedUntil: { type: "integer", example: 1773177610000 },
              expiresAt: { type: "integer", example: 1773177610000 },
            },
          },
        },
      },
    },
  },
  paths: {
    "/api/v1/health": {
      get: {
        summary: "System Health & Liveness Probe",
        description: "Returns health status of the control plane web service and SQLite database connections.",
        operationId: "getSystemHealth",
        tags: ["System Health"],
        responses: {
          "200": {
            description: "Service is fully operational",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthStatus" },
                example: {
                  status: "ok",
                  service: "rapidshift-control-plane",
                  uptime: 3600.2,
                  timestamp: 1773177600000,
                  database: "healthy",
                },
              },
            },
          },
          "503": {
            description: "Service is degraded or database is unreachable",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "degraded" },
                    service: { type: "string", example: "rapidshift-control-plane" },
                    error: { type: "string", example: "SQLITE_BUSY: database is locked" },
                    timestamp: { type: "integer", example: 1773177600000 },
                  },
                },
                example: {
                  status: "degraded",
                  service: "rapidshift-control-plane",
                  error: "Database connection failed",
                  timestamp: 1773177600000,
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/access/status": {
      get: {
        summary: "Evaluate Client Access Gate",
        description:
          "High-throughput endpoint called by client application proxies/middleware. Validates API key, computes entitlement state, and returns signed Ed25519 pass.",
        operationId: "getAccessStatus",
        tags: ["Access Gate"],
        security: [{ ApiKeyAuth: [] }],
        responses: {
          "200": {
            description: "Entitlement evaluated successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/GateStatusResponse" },
                example: {
                  data: {
                    status: "allowed",
                    allowed: true,
                    state: "active",
                    rapidshiftStatus: "online",
                    token: "eyJhbGciOiJFZERTQ...",
                    client: { id: "cli_01HQXYZ123456789" },
                    cachedUntil: 1773177610000,
                    expiresAt: 1773177610000,
                  },
                },
              },
            },
          },
          "401": {
            description: "Missing or invalid API key",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: {
                  error: { code: "unauthorized", message: "Missing API key in Authorization header" },
                },
              },
            },
          },
          "500": {
            description: "Internal gateway evaluation error",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: {
                  error: { code: "internal_error", message: "Failed to evaluate entitlement status" },
                },
              },
            },
          },
        },
      },
    },
    "/api/collect": {
      post: {
        summary: "Ingest Cookieless Analytics Events",
        description:
          "High-performance endpoint receiving pageviews, sessions, custom events, and Core Web Vitals with bot filtering.",
        operationId: "collectAnalyticsEvents",
        tags: ["Analytics"],
        security: [{ PublishableKeyAuth: [] }],
        requestBody: {
          required: true,
          description: "Batch of analytics events or single event payload",
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["clientId"],
                properties: {
                  clientId: { type: "string", example: "cli_01HQXYZ123456789" },
                  events: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["type", "url", "timestamp"],
                      properties: {
                        type: { type: "string", example: "pageview" },
                        url: { type: "string", example: "https://example.com/pricing" },
                        referrer: { type: "string", example: "https://google.com" },
                        timestamp: { type: "integer", example: 1773177600000 },
                        vitals: {
                          type: "object",
                          properties: {
                            lcp: { type: "number", example: 1450 },
                            cls: { type: "number", example: 0.02 },
                            inp: { type: "number", example: 75 },
                          },
                        },
                      },
                    },
                  },
                },
              },
              example: {
                clientId: "cli_01HQXYZ123456789",
                events: [
                  {
                    type: "pageview",
                    url: "https://example.com/dashboard",
                    referrer: "https://example.com/login",
                    timestamp: 1773177600000,
                  },
                ],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Events accepted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    count: { type: "integer", example: 1 },
                  },
                },
                example: { ok: true, count: 1 },
              },
            },
          },
          "400": {
            description: "Invalid payload or missing client identifier",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { error: { type: "string", example: "Missing or invalid client identifier" } },
                },
                example: { error: "Missing or invalid client identifier" },
              },
            },
          },
        },
      },
    },
    "/api/stream": {
      get: {
        summary: "Subscribe to Realtime Server-Sent Events",
        description:
          "Long-lived HTTP text/event-stream delivering updates for tickets, billing balance changes, server telemetry, and domain incidents.",
        operationId: "getRealtimeStream",
        tags: ["Realtime Stream"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "topics",
            in: "query",
            required: false,
            description: "Comma-separated topics to subscribe to (e.g., tickets,billing,domains)",
            schema: { type: "string", default: "tickets,billing" },
            example: "tickets,billing,domains",
          },
        ],
        responses: {
          "200": {
            description: "SSE Event Stream established",
            content: {
              "text/event-stream": {
                schema: { type: "string" },
              },
            },
          },
          "401": {
            description: "Unauthorized session",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/embed-tokens": {
      post: {
        summary: "Mint Scoped Embed Token",
        description: "Creates short-lived scoped tokens (`emb_...`) for Preact web components and embeddable widgets.",
        operationId: "mintEmbedToken",
        tags: ["Embed Tokens"],
        security: [{ SessionAuth: [] }, { ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["widgetType"],
                properties: {
                  widgetType: { type: "string", example: "billing_summary" },
                  scopes: { type: "array", items: { type: "string" }, example: ["read:billing"] },
                  allowedOrigins: { type: "array", items: { type: "string" }, example: ["https://clientapp.com"] },
                  ttlSeconds: { type: "integer", example: 3600 },
                },
              },
              example: {
                widgetType: "billing_summary",
                scopes: ["read:billing"],
                allowedOrigins: ["https://clientapp.com"],
                ttlSeconds: 3600,
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Token generated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        token: { type: "string", example: "emb_01HQXYZ..." },
                        clientId: { type: "string", example: "cli_01HQXYZ123456789" },
                        scopes: { type: "array", items: { type: "string" } },
                        allowedOrigins: { type: "array", items: { type: "string" } },
                        expiresAt: { type: "integer", example: 1773181200000 },
                      },
                    },
                  },
                },
                example: {
                  data: {
                    token: "emb_01HQXYZ123456789ABC",
                    clientId: "cli_01HQXYZ123456789",
                    scopes: ["read:billing"],
                    allowedOrigins: ["https://clientapp.com"],
                    expiresAt: 1773181200000,
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/portal/billing": {
      get: {
        summary: "Get Client Billing Summary",
        description: "Returns outstanding balances, active contract summary, next due date, and recent invoices for portal user.",
        operationId: "getPortalBillingSummary",
        tags: ["Billing & Invoices"],
        security: [{ SessionAuth: [] }],
        responses: {
          "200": {
            description: "Billing summary returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        outstandingPaise: { type: "integer", example: 2500000 },
                        nextDueDate: { type: "string", example: "2026-11-01" },
                        invoices: { type: "array", items: { type: "object" } },
                      },
                    },
                  },
                },
                example: {
                  data: {
                    outstandingPaise: 2500000,
                    nextDueDate: "2026-11-01",
                    invoices: [
                      {
                        id: "inv_01HQ1",
                        invoiceNumber: "RSL/2026-27/0014",
                        totalPaise: 2500000,
                        balancePaise: 2500000,
                        status: "issued",
                        dueDate: "2026-11-01",
                      },
                    ],
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/portal/contracts": {
      get: {
        summary: "Get Client Active Contract",
        description: "Retrieves active contract terms, valid tenure, and payment cycle details.",
        operationId: "getPortalContract",
        tags: ["Billing & Invoices"],
        security: [{ SessionAuth: [] }],
        responses: {
          "200": {
            description: "Contract retrieved",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "string", example: "con_01HQ1" },
                        amountPaise: { type: "integer", example: 5000000 },
                        billingCycle: { type: "string", example: "monthly" },
                        validFrom: { type: "string", example: "2026-04-01" },
                        validTo: { type: "string", example: "2027-03-31" },
                        status: { type: "string", example: "active" },
                      },
                    },
                  },
                },
                example: {
                  data: {
                    id: "con_01HQ123",
                    amountPaise: 5000000,
                    billingCycle: "monthly",
                    validFrom: "2026-04-01",
                    validTo: "2027-03-31",
                    status: "active",
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/billing/invoices/{id}/pdf": {
      get: {
        summary: "Download Invoice PDF",
        description: "Generates or serves the official tax invoice PDF for the specified invoice ID.",
        operationId: "downloadInvoicePdf",
        tags: ["Billing & Invoices"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Unique Invoice ULID ID",
            schema: { type: "string" },
            example: "inv_01HQXYZ123456789",
          },
        ],
        responses: {
          "200": {
            description: "PDF document stream",
            content: {
              "application/pdf": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
          "404": {
            description: "Invoice not found",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "not_found", message: "Invoice not found" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/portal/fleet": {
      get: {
        summary: "List Client PM2 Processes & Server Telemetry",
        description: "Returns mapped PM2 processes, uptime, memory, CPU usage, and server connection status.",
        operationId: "getPortalFleetProcesses",
        tags: ["Fleet Operations"],
        security: [{ SessionAuth: [] }],
        responses: {
          "200": {
            description: "Fleet process list returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", example: "proc_01" },
                          name: { type: "string", example: "client-api" },
                          pmId: { type: "integer", example: 0 },
                          status: { type: "string", example: "online" },
                          uptimeSeconds: { type: "integer", example: 86400 },
                          cpuPercent: { type: "number", example: 1.2 },
                          memoryMb: { type: "number", example: 142.5 },
                        },
                      },
                    },
                  },
                },
                example: {
                  data: [
                    {
                      id: "proc_01",
                      name: "client-api",
                      pmId: 0,
                      status: "online",
                      uptimeSeconds: 86400,
                      cpuPercent: 1.2,
                      memoryMb: 142.5,
                    },
                  ],
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/portal/fleet/processes/{id}/restart": {
      post: {
        summary: "Restart Mapped PM2 Process",
        description:
          "Executes controlled restart on the mapped PM2 process via SSH pool with rate-limiting cooldown and injection protection.",
        operationId: "restartFleetProcess",
        tags: ["Fleet Operations"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Process identifier",
            schema: { type: "string" },
            example: "proc_01",
          },
        ],
        responses: {
          "200": {
            description: "Process restart initiated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Process restart command issued successfully" },
                  },
                },
                example: { success: true, message: "Process restart command issued successfully" },
              },
            },
          },
          "403": {
            description: "Forbidden (process not owned by client)",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "forbidden", message: "Unauthorized access to process" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/portal/fleet/processes/{id}/logs": {
      get: {
        summary: "View Process Logs",
        description: "Retrieves recent stdout and stderr log lines for the mapped PM2 process.",
        operationId: "getFleetProcessLogs",
        tags: ["Fleet Operations"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Process identifier",
            schema: { type: "string" },
            example: "proc_01",
          },
          {
            name: "lines",
            in: "query",
            required: false,
            description: "Number of lines to tail (default 100, max 500)",
            schema: { type: "integer", default: 100 },
            example: 100,
          },
        ],
        responses: {
          "200": {
            description: "Log output returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        lines: { type: "array", items: { type: "string" } },
                      },
                    },
                  },
                },
                example: {
                  data: {
                    lines: ["[2026-10-10 12:00:00] Server listening on port 8080", "[2026-10-10 12:00:01] DB connected"],
                  },
                },
              },
            },
          },
          "403": {
            description: "Forbidden",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "forbidden", message: "Access forbidden" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/portal/domains": {
      get: {
        summary: "List Client Monitored Domains",
        description: "Retrieves all monitored domains registered for the authenticated client.",
        operationId: "getPortalDomains",
        tags: ["Domain Monitoring"],
        security: [{ SessionAuth: [] }],
        responses: {
          "200": {
            description: "Domains list returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", example: "dom_01HQ1" },
                          hostname: { type: "string", example: "api.clientapp.com" },
                          status: { type: "string", example: "up" },
                          uptimeRatio: { type: "number", example: 0.9995 },
                          sslExpiryDays: { type: "integer", example: 45 },
                        },
                      },
                    },
                  },
                },
                example: {
                  data: [
                    {
                      id: "dom_01HQ1",
                      hostname: "api.clientapp.com",
                      status: "up",
                      uptimeRatio: 0.9995,
                      sslExpiryDays: 45,
                    },
                  ],
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/portal/domains/{id}": {
      get: {
        summary: "Get Monitored Domain Details",
        description: "Returns detailed inspection history including SSL certificate chain, DNS records, and RDAP registration.",
        operationId: "getPortalDomainDetail",
        tags: ["Domain Monitoring"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Domain ID",
            schema: { type: "string" },
            example: "dom_01HQ1",
          },
        ],
        responses: {
          "200": {
            description: "Domain details returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "string", example: "dom_01HQ1" },
                        hostname: { type: "string", example: "api.clientapp.com" },
                        status: { type: "string", example: "up" },
                        sslValid: { type: "boolean", example: true },
                        dnsValid: { type: "boolean", example: true },
                        rdapExpiry: { type: "string", example: "2027-01-15" },
                      },
                    },
                  },
                },
                example: {
                  data: {
                    id: "dom_01HQ1",
                    hostname: "api.clientapp.com",
                    status: "up",
                    sslValid: true,
                    dnsValid: true,
                    rdapExpiry: "2027-01-15",
                  },
                },
              },
            },
          },
          "404": {
            description: "Domain not found",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "not_found", message: "Domain not found" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/tickets": {
      get: {
        summary: "List Support Tickets",
        description: "Returns ticket thread list for client or staff member.",
        operationId: "listTickets",
        tags: ["Support Desk"],
        security: [{ SessionAuth: [] }],
        responses: {
          "200": {
            description: "Ticket list returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", example: "tkt_01HQ1" },
                          number: { type: "integer", example: 1042 },
                          subject: { type: "string", example: "Production latency spike" },
                          status: { type: "string", example: "open" },
                          priority: { type: "string", example: "P1" },
                          escalationLevel: { type: "string", example: "L2" },
                        },
                      },
                    },
                  },
                },
                example: {
                  data: [
                    {
                      id: "tkt_01HQ1",
                      number: 1042,
                      subject: "Production latency spike",
                      status: "open",
                      priority: "P1",
                      escalationLevel: "L2",
                    },
                  ],
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
      post: {
        summary: "Create Support Ticket",
        description: "Opens a new support ticket with 24x7 SLA clock initialization.",
        operationId: "createTicket",
        tags: ["Support Desk"],
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["subject", "message"],
                properties: {
                  subject: { type: "string", example: "Cannot connect to SSH server" },
                  message: { type: "string", example: "Connection timed out on host 10.0.0.1" },
                  priority: { type: "string", enum: ["P1", "P2", "P3", "P4"], default: "P3" },
                  category: { type: "string", example: "technical" },
                },
              },
              example: {
                subject: "Cannot connect to SSH server",
                message: "Connection timed out on host 10.0.0.1",
                priority: "P2",
                category: "infrastructure",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Ticket created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "string", example: "tkt_01HQ1" },
                        number: { type: "integer", example: 1043 },
                        subject: { type: "string", example: "Cannot connect to SSH server" },
                        status: { type: "string", example: "open" },
                      },
                    },
                  },
                },
                example: {
                  data: {
                    id: "tkt_01HQ1",
                    number: 1043,
                    subject: "Cannot connect to SSH server",
                    status: "open",
                  },
                },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "validation_error", message: "Subject is required" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/tickets/{id}": {
      get: {
        summary: "Get Ticket Conversation & Timeline",
        description: "Retrieves complete conversation thread, internal notes (staff only), and SLA event timeline.",
        operationId: "getTicketDetail",
        tags: ["Support Desk"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Ticket identifier",
            schema: { type: "string" },
            example: "tkt_01HQ1",
          },
        ],
        responses: {
          "200": {
            description: "Ticket details returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "string", example: "tkt_01HQ1" },
                        subject: { type: "string", example: "Latency spike" },
                        status: { type: "string", example: "in_progress" },
                        messages: { type: "array", items: { type: "object" } },
                      },
                    },
                  },
                },
                example: {
                  data: {
                    id: "tkt_01HQ1",
                    subject: "Latency spike",
                    status: "in_progress",
                    messages: [
                      {
                        id: "msg_1",
                        author: "Alice",
                        body: "Investigating server logs now.",
                        createdAt: 1773177600000,
                      },
                    ],
                  },
                },
              },
            },
          },
          "404": {
            description: "Ticket not found",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "not_found", message: "Ticket not found" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/tickets/{id}/messages": {
      post: {
        summary: "Post Ticket Reply or Note",
        description: "Appends a message to the ticket thread. Emits realtime SSE update to active participants.",
        operationId: "postTicketMessage",
        tags: ["Support Desk"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Ticket identifier",
            schema: { type: "string" },
            example: "tkt_01HQ1",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["body"],
                properties: {
                  body: { type: "string", example: "We have resolved the network interface issue." },
                  isInternal: { type: "boolean", default: false },
                },
              },
              example: {
                body: "We have resolved the network interface issue.",
                isInternal: false,
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Message added",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "string", example: "msg_01" },
                        body: { type: "string", example: "We have resolved the network interface issue." },
                      },
                    },
                  },
                },
                example: {
                  data: { id: "msg_01", body: "We have resolved the network interface issue." },
                },
              },
            },
          },
          "404": {
            description: "Ticket not found",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "not_found", message: "Ticket not found" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/tickets/{id}/escalate": {
      post: {
        summary: "Escalate Ticket Level",
        description: "Manually triggers escalation (L1 -> L2 -> L3) by client or staff.",
        operationId: "escalateTicket",
        tags: ["Support Desk"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Ticket identifier",
            schema: { type: "string" },
            example: "tkt_01HQ1",
          },
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reason: { type: "string", example: "Critical production outage affecting users" },
                },
              },
              example: { reason: "Critical production outage affecting users" },
            },
          },
        },
        responses: {
          "200": {
            description: "Ticket escalated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "string", example: "tkt_01HQ1" },
                        escalationLevel: { type: "string", example: "L2" },
                      },
                    },
                  },
                },
                example: {
                  data: { id: "tkt_01HQ1", escalationLevel: "L2" },
                },
              },
            },
          },
          "400": {
            description: "Cannot escalate further",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "invalid_state", message: "Ticket is already at highest escalation level" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/tickets/{id}/csat": {
      post: {
        summary: "Submit Customer Satisfaction Rating",
        description: "Records CSAT rating (1 to 5) and feedback comment upon ticket resolution.",
        operationId: "submitTicketCsat",
        tags: ["Support Desk"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Ticket identifier",
            schema: { type: "string" },
            example: "tkt_01HQ1",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["score"],
                properties: {
                  score: { type: "integer", minimum: 1, maximum: 5, example: 5 },
                  feedback: { type: "string", example: "Quick and helpful support, thank you!" },
                },
              },
              example: { score: 5, feedback: "Quick and helpful support, thank you!" },
            },
          },
        },
        responses: {
          "200": {
            description: "CSAT score recorded",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean", example: true } },
                },
                example: { success: true },
              },
            },
          },
          "400": {
            description: "Invalid score or unresolvable ticket",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "validation_error", message: "Score must be between 1 and 5" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/tickets/canned-replies": {
      get: {
        summary: "List Canned Replies",
        description: "Retrieves predefined quick responses for staff support agents.",
        operationId: "listCannedReplies",
        tags: ["Support Desk"],
        security: [{ SessionAuth: [] }],
        responses: {
          "200": {
            description: "Canned replies returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", example: "cr_1" },
                          title: { type: "string", example: "Acknowledge Incident" },
                          content: { type: "string", example: "We have received your alert and are investigating." },
                        },
                      },
                    },
                  },
                },
                example: {
                  data: [
                    {
                      id: "cr_1",
                      title: "Acknowledge Incident",
                      content: "We have received your alert and are investigating.",
                    },
                  ],
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/credentials": {
      get: {
        summary: "List Shared Client Credentials",
        description: "Returns metadata for credentials stored in the AES-256-GCM vault (secrets remain concealed).",
        operationId: "listCredentials",
        tags: ["Credentials Vault"],
        security: [{ SessionAuth: [] }],
        responses: {
          "200": {
            description: "Credential metadata list returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", example: "cred_01HQ1" },
                          name: { type: "string", example: "Production DB Password" },
                          category: { type: "string", example: "database" },
                          createdAt: { type: "string", example: "2026-10-01" },
                        },
                      },
                    },
                  },
                },
                example: {
                  data: [
                    {
                      id: "cred_01HQ1",
                      name: "Production DB Password",
                      category: "database",
                      createdAt: "2026-10-01",
                    },
                  ],
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
      post: {
        summary: "Store New Encrypted Credential",
        description: "Encrypts secret with master key envelope and saves to vault.",
        operationId: "createCredential",
        tags: ["Credentials Vault"],
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "secret"],
                properties: {
                  name: { type: "string", example: "API Third-party Secret" },
                  secret: { type: "string", example: "sk_live_123456789" },
                  category: { type: "string", example: "api_key" },
                },
              },
              example: {
                name: "API Third-party Secret",
                secret: "sk_live_123456789",
                category: "api_key",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Credential stored",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "string", example: "cred_01HQ1" },
                        name: { type: "string", example: "API Third-party Secret" },
                      },
                    },
                  },
                },
                example: {
                  data: { id: "cred_01HQ1", name: "API Third-party Secret" },
                },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "validation_error", message: "Name and secret are required" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/credentials/{id}": {
      get: {
        summary: "Get Credential Metadata",
        description: "Retrieves metadata for single vault item without revealing secret.",
        operationId: "getCredentialDetail",
        tags: ["Credentials Vault"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Credential ID",
            schema: { type: "string" },
            example: "cred_01HQ1",
          },
        ],
        responses: {
          "200": {
            description: "Metadata returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "string", example: "cred_01HQ1" },
                        name: { type: "string", example: "Staging SMTP Pass" },
                      },
                    },
                  },
                },
                example: {
                  data: { id: "cred_01HQ1", name: "Staging SMTP Pass" },
                },
              },
            },
          },
          "404": {
            description: "Credential not found",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "not_found", message: "Credential not found" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/credentials/{id}/reveal": {
      post: {
        summary: "Reveal Encrypted Secret (Audited)",
        description: "Decrypts and returns secret value. Records an immutable audit log entry detailing who accessed it.",
        operationId: "revealCredentialSecret",
        tags: ["Credentials Vault"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Credential ID",
            schema: { type: "string" },
            example: "cred_01HQ1",
          },
        ],
        responses: {
          "200": {
            description: "Secret revealed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "string", example: "cred_01HQ1" },
                        secret: { type: "string", example: "super_secret_decrypted_value" },
                      },
                    },
                  },
                },
                example: {
                  data: { id: "cred_01HQ1", secret: "super_secret_decrypted_value" },
                },
              },
            },
          },
          "403": {
            description: "Forbidden",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "forbidden", message: "Insufficient permissions to reveal secret" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/releases": {
      get: {
        summary: "List Client Releases & Beta Links",
        description: "Retrieves distribution links, beta artifacts, and staging deployments for client.",
        operationId: "listReleases",
        tags: ["Releases"],
        security: [{ SessionAuth: [] }],
        responses: {
          "200": {
            description: "Releases list returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", example: "rel_01HQ1" },
                          version: { type: "string", example: "v2.1.0-beta" },
                          channel: { type: "string", example: "beta" },
                          url: { type: "string", example: "https://beta.clientapp.com" },
                          notes: { type: "string", example: "Early preview of new checkout" },
                        },
                      },
                    },
                  },
                },
                example: {
                  data: [
                    {
                      id: "rel_01HQ1",
                      version: "v2.1.0-beta",
                      channel: "beta",
                      url: "https://beta.clientapp.com",
                      notes: "Early preview of new checkout",
                    },
                  ],
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
      post: {
        summary: "Create Release Link",
        description: "Registers a new beta release URL and release notes.",
        operationId: "createRelease",
        tags: ["Releases"],
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["version", "url"],
                properties: {
                  version: { type: "string", example: "v2.2.0" },
                  channel: { type: "string", example: "production" },
                  url: { type: "string", example: "https://app.clientapp.com" },
                  notes: { type: "string", example: "Major release update" },
                },
              },
              example: {
                version: "v2.2.0",
                channel: "production",
                url: "https://app.clientapp.com",
                notes: "Major release update",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Release created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "string", example: "rel_01HQ2" },
                        version: { type: "string", example: "v2.2.0" },
                      },
                    },
                  },
                },
                example: {
                  data: { id: "rel_01HQ2", version: "v2.2.0" },
                },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "validation_error", message: "Version and URL are required" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/releases/{id}": {
      get: {
        summary: "Get Release Details",
        description: "Retrieves single release build details.",
        operationId: "getReleaseDetail",
        tags: ["Releases"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Release ID",
            schema: { type: "string" },
            example: "rel_01HQ1",
          },
        ],
        responses: {
          "200": {
            description: "Release details returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "string", example: "rel_01HQ1" },
                        version: { type: "string", example: "v2.1.0-beta" },
                        url: { type: "string", example: "https://beta.clientapp.com" },
                      },
                    },
                  },
                },
                example: {
                  data: { id: "rel_01HQ1", version: "v2.1.0-beta", url: "https://beta.clientapp.com" },
                },
              },
            },
          },
          "404": {
            description: "Release not found",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "not_found", message: "Release not found" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/portal/api-keys": {
      get: {
        summary: "List Client API Keys",
        description: "Returns active and revoked API keys (masked tokens) for the client.",
        operationId: "listPortalApiKeys",
        tags: ["API Keys"],
        security: [{ SessionAuth: [] }],
        responses: {
          "200": {
            description: "API keys returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", example: "key_01HQ1" },
                          name: { type: "string", example: "Production Gate Key" },
                          prefix: { type: "string", example: "rsk_prod" },
                          scopes: { type: "array", items: { type: "string" } },
                          status: { type: "string", example: "active" },
                        },
                      },
                    },
                  },
                },
                example: {
                  data: [
                    {
                      id: "key_01HQ1",
                      name: "Production Gate Key",
                      prefix: "rsk_prod",
                      scopes: ["gate:verify", "analytics:read"],
                      status: "active",
                    },
                  ],
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
      post: {
        summary: "Generate API Key",
        description: "Creates a new secret key (`rsk_...`) or publishable key (`rpk_...`). The raw secret is returned only once.",
        operationId: "createPortalApiKey",
        tags: ["API Keys"],
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", example: "CI Deployment Key" },
                  scopes: { type: "array", items: { type: "string" }, example: ["gate:verify"] },
                  type: { type: "string", enum: ["secret", "publishable"], default: "secret" },
                },
              },
              example: {
                name: "CI Deployment Key",
                scopes: ["gate:verify"],
                type: "secret",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "API key generated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "string", example: "key_01HQ2" },
                        rawKey: { type: "string", example: "rsk_01HQXYZ1234567890abcdef" },
                        name: { type: "string", example: "CI Deployment Key" },
                      },
                    },
                  },
                },
                example: {
                  data: {
                    id: "key_01HQ2",
                    rawKey: "rsk_01HQXYZ1234567890abcdef",
                    name: "CI Deployment Key",
                  },
                },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "validation_error", message: "Name is required" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/portal/api-keys/{id}": {
      delete: {
        summary: "Revoke API Key",
        description: "Immediately invalidates the specified API key.",
        operationId: "revokePortalApiKey",
        tags: ["API Keys"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Key ID",
            schema: { type: "string" },
            example: "key_01HQ1",
          },
        ],
        responses: {
          "200": {
            description: "Key revoked",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean", example: true } },
                },
                example: { success: true },
              },
            },
          },
          "404": {
            description: "Key not found",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "not_found", message: "API key not found" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/analytics/overview": {
      get: {
        summary: "Get Analytics Overview Metrics",
        description: "Returns aggregated pageviews, unique sessions, top referrers, and device breakdowns for date range.",
        operationId: "getAnalyticsOverview",
        tags: ["Analytics"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "from",
            in: "query",
            required: false,
            description: "ISO date string start of period",
            schema: { type: "string" },
            example: "2026-10-01",
          },
          {
            name: "to",
            in: "query",
            required: false,
            description: "ISO date string end of period",
            schema: { type: "string" },
            example: "2026-10-10",
          },
        ],
        responses: {
          "200": {
            description: "Aggregated metrics returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        pageviews: { type: "integer", example: 48200 },
                        visitors: { type: "integer", example: 12400 },
                        bounceRate: { type: "number", example: 0.34 },
                        topReferrers: { type: "array", items: { type: "object" } },
                      },
                    },
                  },
                },
                example: {
                  data: {
                    pageviews: 48200,
                    visitors: 12400,
                    bounceRate: 0.34,
                    topReferrers: [{ referrer: "google.com", count: 18500 }],
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/analytics/timeseries": {
      get: {
        summary: "Get Analytics Timeseries Data",
        description: "Returns hourly or daily pageview and visitor buckets for charts.",
        operationId: "getAnalyticsTimeseries",
        tags: ["Analytics"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "interval",
            in: "query",
            required: false,
            description: "Time bucket interval (hourly or daily)",
            schema: { type: "string", enum: ["hourly", "daily"], default: "daily" },
            example: "daily",
          },
        ],
        responses: {
          "200": {
            description: "Timeseries points returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          timestamp: { type: "string", example: "2026-10-10" },
                          pageviews: { type: "integer", example: 4500 },
                          visitors: { type: "integer", example: 1200 },
                        },
                      },
                    },
                  },
                },
                example: {
                  data: [
                    { timestamp: "2026-10-09", pageviews: 4200, visitors: 1100 },
                    { timestamp: "2026-10-10", pageviews: 4500, visitors: 1200 },
                  ],
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/analytics/vitals": {
      get: {
        summary: "Get Core Web Vitals Distributions",
        description: "Returns p75 percentiles for Largest Contentful Paint (LCP), Interaction to Next Paint (INP), and Cumulative Layout Shift (CLS).",
        operationId: "getAnalyticsVitals",
        tags: ["Analytics"],
        security: [{ SessionAuth: [] }],
        responses: {
          "200": {
            description: "Web vitals percentiles returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        lcpP75: { type: "number", example: 1200 },
                        inpP75: { type: "number", example: 65 },
                        clsP75: { type: "number", example: 0.015 },
                      },
                    },
                  },
                },
                example: {
                  data: { lcpP75: 1200, inpP75: 65, clsP75: 0.015 },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/analytics/export": {
      get: {
        summary: "Pull Export Analytics Events",
        description: "Allows client to pull raw and rolled-up event batches with date and pagination filters.",
        operationId: "exportAnalyticsEvents",
        tags: ["Analytics"],
        security: [{ ApiKeyAuth: [] }, { SessionAuth: [] }],
        parameters: [
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", default: 1000 },
            example: 1000,
          },
        ],
        responses: {
          "200": {
            description: "Events exported",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        events: { type: "array", items: { type: "object" } },
                        cursor: { type: "string" },
                      },
                    },
                  },
                },
                example: {
                  data: {
                    events: [
                      { id: "evt_1", type: "pageview", url: "/pricing", timestamp: 1773177600000 },
                    ],
                    cursor: "evt_1",
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/analytics/offload": {
      post: {
        summary: "Trigger Webhook Analytics Offload",
        description: "Manually triggers pushing queued analytics batches to the client's configured HMAC offload webhook endpoint.",
        operationId: "triggerAnalyticsOffload",
        tags: ["Analytics"],
        security: [{ ApiKeyAuth: [] }, { SessionAuth: [] }],
        responses: {
          "200": {
            description: "Offload queued or completed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    batchesSent: { type: "integer", example: 3 },
                  },
                },
                example: { success: true, batchesSent: 3 },
              },
            },
          },
          "400": {
            description: "No offload endpoint configured",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "not_configured", message: "No analytics offload webhook endpoint configured" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/admin/clients": {
      get: {
        summary: "List Clients (Admin)",
        description: "Returns paginated list of client accounts with status, contract summaries, and outstanding dues.",
        operationId: "adminListClients",
        tags: ["Admin Clients"],
        security: [{ SessionAuth: [] }],
        responses: {
          "200": {
            description: "Clients list returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { type: "object" } },
                  },
                },
                example: {
                  data: [
                    { id: "cli_1", name: "Acme Corp", slug: "acme", status: "active", totalOutstandingPaise: 0 },
                  ],
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
      post: {
        summary: "Create New Client (Admin)",
        description: "Registers a new tenant client with billing settings, contact email, and currency.",
        operationId: "adminCreateClient",
        tags: ["Admin Clients"],
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "email"],
                properties: {
                  name: { type: "string", example: "Acme Corp" },
                  email: { type: "string", format: "email", example: "billing@acme.com" },
                  currency: { type: "string", default: "INR" },
                  gstin: { type: "string", example: "27AAPFU0939F1ZV" },
                },
              },
              example: {
                name: "Acme Corp",
                email: "billing@acme.com",
                currency: "INR",
                gstin: "27AAPFU0939F1ZV",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Client created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: { id: { type: "string", example: "cli_01HQ1" }, name: { type: "string" } },
                    },
                  },
                },
                example: {
                  data: { id: "cli_01HQ1", name: "Acme Corp" },
                },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "validation_error", message: "Client name is required" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/admin/clients/{id}": {
      get: {
        summary: "Get Client Profile (Admin)",
        description: "Retrieves complete client profile, contracts, servers, domains, and billing history.",
        operationId: "adminGetClient",
        tags: ["Admin Clients"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Client ID",
            schema: { type: "string" },
            example: "cli_01HQ1",
          },
        ],
        responses: {
          "200": {
            description: "Client profile returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "string", example: "cli_01HQ1" },
                        name: { type: "string", example: "Acme Corp" },
                      },
                    },
                  },
                },
                example: {
                  data: { id: "cli_01HQ1", name: "Acme Corp" },
                },
              },
            },
          },
          "404": {
            description: "Client not found",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "not_found", message: "Client not found" } },
              },
            },
          },
        },
      },
      put: {
        summary: "Update Client Profile (Admin)",
        description: "Updates client details, tax status, or billing contacts.",
        operationId: "adminUpdateClient",
        tags: ["Admin Clients"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Client ID",
            schema: { type: "string" },
            example: "cli_01HQ1",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  email: { type: "string" },
                  status: { type: "string" },
                },
              },
              example: { name: "Acme Global Technologies", email: "billing@acmeglobal.com" },
            },
          },
        },
        responses: {
          "200": {
            description: "Client updated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "object" },
                  },
                },
                example: { data: { id: "cli_01HQ1", name: "Acme Global Technologies" } },
              },
            },
          },
          "404": {
            description: "Client not found",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "not_found", message: "Client not found" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/admin/clients/{id}/invite": {
      post: {
        summary: "Invite Client User (Admin)",
        description: "Creates and emails a client portal user invitation link.",
        operationId: "adminInviteClientUser",
        tags: ["Admin Clients"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Client ID",
            schema: { type: "string" },
            example: "cli_01HQ1",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email"],
                properties: {
                  email: { type: "string", format: "email", example: "dev@acme.com" },
                  role: { type: "string", enum: ["client_owner", "client_staff"], default: "client_staff" },
                },
              },
              example: { email: "dev@acme.com", role: "client_owner" },
            },
          },
        },
        responses: {
          "200": {
            description: "Invitation sent",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean", example: true } },
                },
                example: { success: true },
              },
            },
          },
          "400": {
            description: "Failed to send invitation",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "invite_failed", message: "User already exists or email error" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/admin/contracts": {
      get: {
        summary: "List Contracts (Admin)",
        description: "Retrieves contracts across all clients.",
        operationId: "adminListContracts",
        tags: ["Admin Contracts"],
        security: [{ SessionAuth: [] }],
        responses: {
          "200": {
            description: "Contracts list returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { type: "object" } },
                  },
                },
                example: {
                  data: [
                    { id: "con_1", clientId: "cli_1", amountPaise: 5000000, status: "active" },
                  ],
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
      post: {
        summary: "Create Contract (Admin)",
        description: "Creates contract with valid-from/to tenure, anchor day, billing cycle, and amount.",
        operationId: "adminCreateContract",
        tags: ["Admin Contracts"],
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["clientId", "amountPaise", "validFrom", "validTo", "billingCycle"],
                properties: {
                  clientId: { type: "string", example: "cli_01HQ1" },
                  amountPaise: { type: "integer", example: 5000000 },
                  validFrom: { type: "string", example: "2026-04-01" },
                  validTo: { type: "string", example: "2027-03-31" },
                  billingCycle: { type: "string", enum: ["monthly", "quarterly", "annual"] },
                },
              },
              example: {
                clientId: "cli_01HQ1",
                amountPaise: 5000000,
                validFrom: "2026-04-01",
                validTo: "2027-03-31",
                billingCycle: "monthly",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Contract created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { type: "object" } },
                },
                example: { data: { id: "con_01HQ1", status: "draft" } },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "validation_error", message: "Valid tenure dates are required" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/admin/contracts/{id}/activate": {
      post: {
        summary: "Activate Contract (Admin)",
        description: "Transitions contract from draft to active, initiating the billing schedule.",
        operationId: "adminActivateContract",
        tags: ["Admin Contracts"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Contract ID",
            schema: { type: "string" },
            example: "con_01HQ1",
          },
        ],
        responses: {
          "200": {
            description: "Contract activated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean", example: true } },
                },
                example: { success: true },
              },
            },
          },
          "400": {
            description: "Cannot activate contract",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "invalid_state", message: "Contract is already active or terminated" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/admin/invoices": {
      get: {
        summary: "List Invoices (Admin)",
        description: "Returns all issued, paid, and overdue invoices with GST breakdown and balance.",
        operationId: "adminListInvoices",
        tags: ["Admin Invoices"],
        security: [{ SessionAuth: [] }],
        responses: {
          "200": {
            description: "Invoices returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { type: "object" } },
                  },
                },
                example: {
                  data: [
                    { id: "inv_1", invoiceNumber: "RSL/2026-27/0001", totalPaise: 5900000, status: "paid" },
                  ],
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
      post: {
        summary: "Create Manual Invoice (Admin)",
        description: "Drafts a manual invoice with custom line items and tax calculations.",
        operationId: "adminCreateInvoice",
        tags: ["Admin Invoices"],
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["clientId", "items", "dueDate"],
                properties: {
                  clientId: { type: "string", example: "cli_01HQ1" },
                  items: { type: "array", items: { type: "object" } },
                  dueDate: { type: "string", example: "2026-11-01" },
                },
              },
              example: {
                clientId: "cli_01HQ1",
                items: [{ description: "Consulting and architecture", amountPaise: 5000000 }],
                dueDate: "2026-11-01",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Invoice drafted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { type: "object" } },
                },
                example: { data: { id: "inv_01HQ1", status: "draft" } },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "validation_error", message: "At least one line item required" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/admin/invoices/{id}/issue": {
      post: {
        summary: "Issue Invoice (Admin)",
        description: "Finalizes invoice, assigns sequential FY numbering series, locks immutability, and sends PDF email.",
        operationId: "adminIssueInvoice",
        tags: ["Admin Invoices"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Invoice ID",
            schema: { type: "string" },
            example: "inv_01HQ1",
          },
        ],
        responses: {
          "200": {
            description: "Invoice issued",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "string", example: "inv_01HQ1" },
                        invoiceNumber: { type: "string", example: "RSL/2026-27/0042" },
                        status: { type: "string", example: "issued" },
                      },
                    },
                  },
                },
                example: {
                  data: { id: "inv_01HQ1", invoiceNumber: "RSL/2026-27/0042", status: "issued" },
                },
              },
            },
          },
          "400": {
            description: "Cannot issue invoice",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "invalid_state", message: "Invoice is already issued" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/admin/payments": {
      get: {
        summary: "List Payments (Admin)",
        description: "Returns ledger of all recorded client payments and allocations.",
        operationId: "adminListPayments",
        tags: ["Admin Payments"],
        security: [{ SessionAuth: [] }],
        responses: {
          "200": {
            description: "Payments ledger returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { type: "object" } },
                  },
                },
                example: {
                  data: [
                    { id: "pay_1", invoiceId: "inv_1", amountPaise: 5900000, method: "bank_transfer" },
                  ],
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
      post: {
        summary: "Record Payment (Admin)",
        description: "Records manual payment (UPI, bank transfer, cheque). Updates invoice balance and triggers entitlement recalculation.",
        operationId: "adminRecordPayment",
        tags: ["Admin Payments"],
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["invoiceId", "amountPaise", "method"],
                properties: {
                  invoiceId: { type: "string", example: "inv_01HQ1" },
                  amountPaise: { type: "integer", example: 5900000 },
                  method: { type: "string", enum: ["upi", "bank_transfer", "cheque", "cash"] },
                  referenceNumber: { type: "string", example: "NEFT202610101234" },
                },
              },
              example: {
                invoiceId: "inv_01HQ1",
                amountPaise: 5900000,
                method: "bank_transfer",
                referenceNumber: "NEFT202610101234",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Payment recorded",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        paymentId: { type: "string", example: "pay_01HQ1" },
                        remainingBalancePaise: { type: "integer", example: 0 },
                      },
                    },
                  },
                },
                example: {
                  data: { paymentId: "pay_01HQ1", remainingBalancePaise: 0 },
                },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "validation_error", message: "Payment amount exceeds balance" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/admin/servers": {
      get: {
        summary: "List Registered Fleet Servers (Admin)",
        description: "Returns managed Linux servers with SSH host fingerprints and connection status.",
        operationId: "adminListServers",
        tags: ["Admin Servers"],
        security: [{ SessionAuth: [] }],
        responses: {
          "200": {
            description: "Servers returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { type: "array", items: { type: "object" } } },
                },
                example: {
                  data: [{ id: "srv_1", name: "Oracle Compute 1", host: "10.0.0.1", port: 22 }],
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
      post: {
        summary: "Register Fleet Server (Admin)",
        description: "Registers new server with AES-256-GCM encrypted SSH private key.",
        operationId: "adminCreateServer",
        tags: ["Admin Servers"],
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "host", "privateKey"],
                properties: {
                  name: { type: "string", example: "Oracle Cloud App Node" },
                  host: { type: "string", example: "129.153.1.20" },
                  port: { type: "integer", default: 22 },
                  username: { type: "string", default: "ubuntu" },
                  privateKey: { type: "string", example: "-----BEGIN OPENSSH PRIVATE KEY-----\n..." },
                },
              },
              example: {
                name: "Oracle Cloud App Node",
                host: "129.153.1.20",
                port: 22,
                username: "ubuntu",
                privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\n...",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Server registered",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { type: "object" } },
                },
                example: { data: { id: "srv_01HQ1", name: "Oracle Cloud App Node" } },
              },
            },
          },
          "400": {
            description: "Invalid key or host unreachable",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "ssh_error", message: "Failed to parse SSH private key" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/admin/servers/{id}": {
      get: {
        summary: "Get Server Details (Admin)",
        description: "Retrieves server configuration and telemetry status.",
        operationId: "adminGetServer",
        tags: ["Admin Servers"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Server ID",
            schema: { type: "string" },
            example: "srv_01HQ1",
          },
        ],
        responses: {
          "200": {
            description: "Server details returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { type: "object" } },
                },
                example: { data: { id: "srv_01HQ1", name: "Oracle Compute 1", host: "10.0.0.1" } },
              },
            },
          },
          "404": {
            description: "Server not found",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "not_found", message: "Server not found" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/admin/servers/{id}/discover": {
      post: {
        summary: "Discover PM2 Processes on Server (Admin)",
        description: "Connects via SSH and executes `pm2 jlist` to discover running application processes.",
        operationId: "adminDiscoverServerProcesses",
        tags: ["Admin Servers"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Server ID",
            schema: { type: "string" },
            example: "srv_01HQ1",
          },
        ],
        responses: {
          "200": {
            description: "Discovered processes returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          pmId: { type: "integer", example: 0 },
                          name: { type: "string", example: "api-backend" },
                          status: { type: "string", example: "online" },
                        },
                      },
                    },
                  },
                },
                example: {
                  data: [
                    { pmId: 0, name: "api-backend", status: "online" },
                    { pmId: 1, name: "worker", status: "online" },
                  ],
                },
              },
            },
          },
          "500": {
            description: "SSH discovery failed",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "ssh_failed", message: "SSH connection timed out" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/admin/servers/processes/{id}/map": {
      post: {
        summary: "Map PM2 Process to Client (Admin)",
        description: "Assigns ownership of a discovered process to a client for self-service restart & log viewing.",
        operationId: "adminMapProcessToClient",
        tags: ["Admin Servers"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Process identifier",
            schema: { type: "string" },
            example: "proc_01",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["clientId"],
                properties: {
                  clientId: { type: "string", example: "cli_01HQ1" },
                },
              },
              example: { clientId: "cli_01HQ1" },
            },
          },
        },
        responses: {
          "200": {
            description: "Process mapped",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean", example: true } },
                },
                example: { success: true },
              },
            },
          },
          "404": {
            description: "Process not found",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "not_found", message: "Process not found" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/admin/domains": {
      get: {
        summary: "List All Monitored Domains (Admin)",
        description: "Returns all client domains across the platform with incident status.",
        operationId: "adminListDomains",
        tags: ["Admin Domains"],
        security: [{ SessionAuth: [] }],
        responses: {
          "200": {
            description: "Domains list returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { type: "array", items: { type: "object" } } },
                },
                example: {
                  data: [
                    { id: "dom_1", hostname: "example.com", status: "up", checkIntervalSec: 60 },
                  ],
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
      post: {
        summary: "Register Domain for Monitoring (Admin)",
        description: "Configures HTTP uptime, TLS certificate, DNS, and RDAP checks for a domain.",
        operationId: "adminCreateDomain",
        tags: ["Admin Domains"],
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["clientId", "hostname"],
                properties: {
                  clientId: { type: "string", example: "cli_01HQ1" },
                  hostname: { type: "string", example: "api.clientapp.com" },
                  targetUrl: { type: "string", example: "https://api.clientapp.com/health" },
                  checkIntervalSec: { type: "integer", default: 60 },
                },
              },
              example: {
                clientId: "cli_01HQ1",
                hostname: "api.clientapp.com",
                targetUrl: "https://api.clientapp.com/health",
                checkIntervalSec: 60,
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Domain registered",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { type: "object" } },
                },
                example: { data: { id: "dom_01HQ1", hostname: "api.clientapp.com" } },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "validation_error", message: "Hostname is invalid" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/admin/domains/{id}": {
      get: {
        summary: "Get Monitored Domain Status (Admin)",
        description: "Retrieves domain check history and active incidents.",
        operationId: "adminGetDomain",
        tags: ["Admin Domains"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Domain ID",
            schema: { type: "string" },
            example: "dom_01HQ1",
          },
        ],
        responses: {
          "200": {
            description: "Domain returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { type: "object" } },
                },
                example: { data: { id: "dom_01HQ1", hostname: "api.clientapp.com", status: "up" } },
              },
            },
          },
          "404": {
            description: "Domain not found",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "not_found", message: "Domain not found" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/admin/domains/{id}/check": {
      post: {
        summary: "Execute Immediate Domain Check (Admin)",
        description: "Forces an immediate out-of-cycle HTTP, SSL, and DNS check.",
        operationId: "adminCheckDomainNow",
        tags: ["Admin Domains"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Domain ID",
            schema: { type: "string" },
            example: "dom_01HQ1",
          },
        ],
        responses: {
          "200": {
            description: "Check executed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        status: { type: "string", example: "up" },
                        statusCode: { type: "integer", example: 200 },
                        responseTimeMs: { type: "number", example: 84 },
                        sslValid: { type: "boolean", example: true },
                      },
                    },
                  },
                },
                example: {
                  data: { status: "up", statusCode: 200, responseTimeMs: 84, sslValid: true },
                },
              },
            },
          },
          "404": {
            description: "Domain not found",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "not_found", message: "Domain not found" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/admin/entitlements/{clientId}": {
      get: {
        summary: "Get Client Entitlement Status (Admin)",
        description: "Returns client current access state (active, overdue, blocked, suspended) and overrides.",
        operationId: "adminGetClientEntitlement",
        tags: ["Admin Entitlements"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "clientId",
            in: "path",
            required: true,
            description: "Client ID",
            schema: { type: "string" },
            example: "cli_01HQ1",
          },
        ],
        responses: {
          "200": {
            description: "Entitlement status returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        state: { type: "string", example: "active" },
                        allowed: { type: "boolean", example: true },
                        override: { type: "string", nullable: true },
                      },
                    },
                  },
                },
                example: {
                  data: { state: "active", allowed: true, override: null },
                },
              },
            },
          },
          "404": {
            description: "Client not found",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "not_found", message: "Client not found" } },
              },
            },
          },
        },
      },
      put: {
        summary: "Set Entitlement Override (Admin)",
        description: "Manually force-allows or force-blocks access for a client regardless of billing status.",
        operationId: "adminSetEntitlementOverride",
        tags: ["Admin Entitlements"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "clientId",
            in: "path",
            required: true,
            description: "Client ID",
            schema: { type: "string" },
            example: "cli_01HQ1",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["action"],
                properties: {
                  action: { type: "string", enum: ["force_allow", "force_block", "clear_override"] },
                  reason: { type: "string", example: "Approved temporary billing extension until Friday" },
                  expiresAt: { type: "string", example: "2026-10-15T00:00:00Z" },
                },
              },
              example: {
                action: "force_allow",
                reason: "Approved temporary billing extension until Friday",
                expiresAt: "2026-10-15T00:00:00Z",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Override updated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean", example: true } },
                },
                example: { success: true },
              },
            },
          },
          "400": {
            description: "Invalid override action",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "invalid_action", message: "Invalid action specified" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/admin/api-keys": {
      get: {
        summary: "List All Platform API Keys (Admin)",
        description: "Lists API keys across all tenants.",
        operationId: "adminListAllApiKeys",
        tags: ["Admin Settings"],
        security: [{ SessionAuth: [] }],
        responses: {
          "200": {
            description: "API keys returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { type: "array", items: { type: "object" } } },
                },
                example: {
                  data: [{ id: "key_1", clientId: "cli_1", prefix: "rsk_prod", status: "active" }],
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
      post: {
        summary: "Create API Key for Client (Admin)",
        description: "Mints an API key on behalf of a client.",
        operationId: "adminCreateApiKeyForClient",
        tags: ["Admin Settings"],
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["clientId", "name"],
                properties: {
                  clientId: { type: "string", example: "cli_01HQ1" },
                  name: { type: "string", example: "Staging Key" },
                  scopes: { type: "array", items: { type: "string" } },
                },
              },
              example: { clientId: "cli_01HQ1", name: "Staging Key", scopes: ["gate:verify"] },
            },
          },
        },
        responses: {
          "201": {
            description: "Key generated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: { rawKey: { type: "string", example: "rsk_01HQ..." } },
                    },
                  },
                },
                example: { data: { rawKey: "rsk_01HQXYZ123456" } },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "validation_error", message: "Client ID is required" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/admin/api-keys/{id}": {
      delete: {
        summary: "Revoke API Key (Admin)",
        description: "Revokes any tenant API key.",
        operationId: "adminRevokeApiKey",
        tags: ["Admin Settings"],
        security: [{ SessionAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Key ID",
            schema: { type: "string" },
            example: "key_01HQ1",
          },
        ],
        responses: {
          "200": {
            description: "Key revoked",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean", example: true } },
                },
                example: { success: true },
              },
            },
          },
          "404": {
            description: "Key not found",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "not_found", message: "Key not found" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/admin/settings": {
      get: {
        summary: "Get Firm Settings (Admin)",
        description: "Retrieves company legal name, GSTIN, PAN, bank details, and SMTP configuration.",
        operationId: "adminGetSettings",
        tags: ["Admin Settings"],
        security: [{ SessionAuth: [] }],
        responses: {
          "200": {
            description: "Settings returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        firmLegalName: { type: "string", example: "RapidShift Labs LLP" },
                        gstin: { type: "string", example: "27AABCR1234A1Z5" },
                        pan: { type: "string", example: "AABCR1234A" },
                        smtpConfigured: { type: "boolean", example: true },
                      },
                    },
                  },
                },
                example: {
                  data: {
                    firmLegalName: "RapidShift Labs LLP",
                    gstin: "27AABCR1234A1Z5",
                    pan: "AABCR1234A",
                    smtpConfigured: true,
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "unauthorized", message: "Unauthorized" } },
              },
            },
          },
        },
      },
      put: {
        summary: "Update Firm Settings (Admin)",
        description: "Updates company legal name, tax identifiers, banking details, or encrypted SMTP credentials.",
        operationId: "adminUpdateSettings",
        tags: ["Admin Settings"],
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  firmLegalName: { type: "string", example: "RapidShift Labs LLP" },
                  gstin: { type: "string", example: "27AABCR1234A1Z5" },
                  pan: { type: "string", example: "AABCR1234A" },
                  smtpHost: { type: "string", example: "smtp.gmail.com" },
                  smtpPort: { type: "integer", example: 587 },
                  smtpUser: { type: "string", example: "alerts@rapidshiftlabs.com" },
                  smtpPass: { type: "string", example: "app-password" },
                },
              },
              example: {
                firmLegalName: "RapidShift Labs LLP",
                gstin: "27AABCR1234A1Z5",
                pan: "AABCR1234A",
                smtpHost: "smtp.gmail.com",
                smtpPort: 587,
                smtpUser: "alerts@rapidshiftlabs.com",
                smtpPass: "app-password",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Settings updated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean", example: true } },
                },
                example: { success: true },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "validation_error", message: "Invalid GSTIN format" } },
              },
            },
          },
        },
      },
    },
    "/api/v1/admin/settings/test-email": {
      post: {
        summary: "Test Outgoing SMTP Email (Admin)",
        description: "Sends a test email to verify configured Nodemailer SMTP credentials.",
        operationId: "adminTestSmtpEmail",
        tags: ["Admin Settings"],
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["targetEmail"],
                properties: {
                  targetEmail: { type: "string", format: "email", example: "admin@rapidshiftlabs.com" },
                },
              },
              example: { targetEmail: "admin@rapidshiftlabs.com" },
            },
          },
        },
        responses: {
          "200": {
            description: "Test email sent successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean", example: true } },
                },
                example: { success: true },
              },
            },
          },
          "500": {
            description: "SMTP connection failed",
            content: {
              "application/json": {
                schema: standardErrorSchema,
                example: { error: { code: "smtp_error", message: "Invalid SMTP authentication" } },
              },
            },
          },
        },
      },
    },
  },
};
