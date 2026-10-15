"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  BookOpen,
  Search,
  Code2,
  ShieldCheck,
  Server,
  Receipt,
  FileText,
  LifeBuoy,
  Key,
  Globe,
  BarChart3,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Terminal,
  Cpu,
  Layers,
  ArrowRight,
  AlertTriangle,
  Info,
  CheckCircle2,
  Settings,
  CreditCard,
  Rocket,
  Lock,
} from "lucide-react";
import { RapidShiftLogo } from "@/components/brand/rapidshift-logo";

interface RunbookStep {
  title: string;
  description: string;
  code?: string;
  language?: string;
  tip?: string;
  caution?: string;
}

interface Runbook {
  id: string;
  category: "admin" | "portal" | "embeds" | "gate" | "architecture";
  badge: string;
  title: string;
  summary: string;
  timeToRead: string;
  tags: string[];
  routeLink?: string;
  steps: RunbookStep[];
}

const RUNBOOKS: Runbook[] = [
  // ================= ADMIN RUNBOOKS =================
  {
    id: "admin-client-onboarding",
    category: "admin",
    badge: "Admin Runbook",
    title: "Client Onboarding & Tenant Creation",
    summary:
      "Step-by-step guide to provisioning new client tenants, legal entity names, currency configuration, and inviting primary client admins.",
    timeToRead: "4 min read",
    tags: ["clients", "onboarding", "tenants", "commercial"],
    routeLink: "/admin/clients",
    steps: [
      {
        title: "1. Access Client Management Console",
        description:
          "Navigate to Commercial -> Clients in the admin dashboard navigation (/admin/clients). This surface renders all active and archived client accounts.",
      },
      {
        title: "2. Input Legal Entity & Operational Metadata",
        description:
          "Click '+ New Client'. Provide the formal Business Name, Legal Registered Entity Name, Contact Person Email, and Billing Currency (INR by default). The system automatically mints a unique domain-prefixed identifier: cli_[ULID].",
        code: `// Example created client tenant aggregate
{
  "id": "cli_01M4KF1YVKPEAR7WNBNV4RYB67",
  "name": "Acme Enterprises Ltd",
  "email": "billing@acme.com",
  "currency": "INR",
  "status": "active"
}`,
        language: "json",
      },
      {
        title: "3. Provision Client Admin Credentials",
        description:
          "Head to Admin Settings or Identity Management to generate the initial magic link or temporary password. Client users authenticate on the isolated client portal URL (/portal/login) and cannot access admin routes.",
        tip: "Each client has isolated authorization context. Client tokens only authorize access to resources where row.clientId matches actor.clientId.",
      },
    ],
  },
  {
    id: "admin-contracts-cycles",
    category: "admin",
    badge: "Admin Runbook",
    title: "Contract Configuration & Billing Cycles",
    summary:
      "Define service retainers, tenure date ranges, month-end billing period clamping, and SLA response tiers for clients.",
    timeToRead: "5 min read",
    tags: ["contracts", "retainer", "sla", "cycles"],
    routeLink: "/admin/contracts",
    steps: [
      {
        title: "1. Create Contract for Client",
        description:
          "Open Commercial -> Contracts (/admin/contracts) and select 'New Contract'. Choose the target Client Tenant from the dropdown.",
      },
      {
        title: "2. Configure Financial Tenure & Cadence",
        description:
          "Specify the contractual retainer amount in Minor units (e.g., 1,500,000 Paise = ₹15,000.00). Select the billing cycle: Monthly, Quarterly, Semi-Annual, or Annual. Set validFrom and validTo epoch boundaries.",
      },
      {
        title: "3. Billing Period Generator & Month-End Clamping",
        description:
          "The core domain engine automatically calculates discrete billing periods. For 31st or 29th start dates in February or 30-day months, the scheduler enforces calendar clamping to prevent drift.",
        code: `// Automatic Billing Period Calculation Rule:
// Jan 31 -> Feb 28 (Clamped) -> Mar 31 -> Apr 30 (Clamped)
const period = calculateNextPeriod(contract.validFrom, contract.cycle);`,
        language: "typescript",
      },
      {
        title: "4. Assign SLA Support Tier",
        description:
          "Attach the contractual SLA profile: P1 Critical (1h response, 4h resolution), P2 High (4h response), P3 Normal (24h response). The support worker uses these parameters to monitor active SLA clocks.",
      },
    ],
  },
  {
    id: "admin-invoicing-gst",
    category: "admin",
    badge: "Admin Runbook",
    title: "GST Invoicing, Numbering Series & Dunning",
    summary:
      "Automated and manual invoice generation, intra-state CGST+SGST vs inter-state IGST calculation, PDF rendering, and automated dunning reminders.",
    timeToRead: "6 min read",
    tags: ["invoices", "gst", "cgst", "igst", "tax", "dunning"],
    routeLink: "/admin/invoices",
    steps: [
      {
        title: "1. Firm GST Configuration Prerequisite",
        description:
          "Before issuing GST invoices, ensure your firm's legal GSTIN and State Code are configured in /admin/settings. The system strictly prohibits GST billing if firm tax credentials are missing.",
        caution: "GST mode will throw a validation error if firm GSTIN is not set in settings.",
      },
      {
        title: "2. Tax Calculation Mechanics (Intra vs Inter-State)",
        description:
          "When generating an invoice with billingMode='gst': If the client's state code matches the firm's state code, the engine splits tax into CGST (900 bps = 9%) and SGST (900 bps = 9%). If the client is from a different state, IGST (1800 bps = 18%) is applied. Non-GST mode calculates 0% tax.",
        code: `// Tax Calculation Engine:
if (billingMode === "gst") {
  if (clientState === firmState) {
    cgstMinor = Math.round((subtotal * 900) / 10000);
    sgstMinor = Math.round((subtotal * 900) / 10000);
    total = subtotal + cgstMinor + sgstMinor;
  } else {
    igstMinor = Math.round((subtotal * 1800) / 10000);
    total = subtotal + igstMinor;
  }
}`,
        language: "typescript",
      },
      {
        title: "3. Sequential Numbering Series per Financial Year",
        description:
          "Invoices receive sequential numbers based on mode and Indian Financial Year: 'RSL/GST/2026-27/0001' or 'RSL/NON-GST/2026-27/0001'. The series resets counter each April 1st.",
      },
      {
        title: "4. Dunning Schedule & Overdue Tracking",
        description:
          "The billing background daemon checks unpaid invoices past their dueDate. Automated reminder emails are dispatched at T-3 days, Due Date, and T+3 days. Unsettled invoices automatically update the client's Entitlement state to Overdue.",
      },
    ],
  },
  {
    id: "admin-payment-reconciliation",
    category: "admin",
    badge: "Admin Runbook",
    title: "Payment Settlement & Realtime Gate Recovery",
    summary:
      "Record full or partial settlements, reconcile bank transactions, and instantly restore client access gate permissions via outbox event dispatch.",
    timeToRead: "4 min read",
    tags: ["payments", "reconciliation", "gate", "entitlement"],
    routeLink: "/admin/payments",
    steps: [
      {
        title: "1. Record Client Payment",
        description:
          "Navigate to Commercial -> Payments (/admin/payments). Click 'Record Payment', select the unpaid Invoice, and input payment method (UPI, NEFT, IMPS, Stripe, Cash).",
      },
      {
        title: "2. Transaction Reference & Balance Decrement",
        description:
          "Enter the bank transaction UTR or gateway reference. The engine atomically decrements the invoice's balanceMinor and updates status to 'paid' or 'partially_paid'.",
      },
      {
        title: "3. Outbox Event & Gate Cache Invalidation",
        description:
          "The repository inserts an 'InvoicePaid' event into the transactional outbox table. The entitlement module immediately updates the client status to 'active', and the in-memory LRU gate cache is purged.",
        code: `// Instant gate recovery upon payment settlement:
await entitlementModule.handleBillingEvent("InvoicePaid", {
  clientId,
  invoiceId,
  balancePaise: 0
});
clearGateCache(); // Allows client app middleware within < 5s`,
        language: "typescript",
      },
    ],
  },
  {
    id: "admin-fleet-discovery",
    category: "admin",
    badge: "Admin Runbook",
    title: "PM2 Fleet Discovery & Client Mapping",
    summary:
      "Connect Linux servers over encrypted SSH, discover running PM2 daemon processes, and map processes to client tenants with strict security boundaries.",
    timeToRead: "5 min read",
    tags: ["fleet", "pm2", "ssh", "infrastructure", "servers"],
    routeLink: "/admin/servers",
    steps: [
      {
        title: "1. Register Linux Host Server",
        description:
          "Under Infrastructure -> Fleet & PM2 (/admin/servers), click 'Add Host Server'. Provide the server IP, SSH port (22), username (typically 'ubuntu'), and paste the SSH Private Key.",
        tip: "Private keys are encrypted at rest in the SQLite database using AES-256-GCM. Plaintext keys are never stored or logged.",
      },
      {
        title: "2. Execute PM2 Process Discovery",
        description:
          "Click 'Discover Processes'. The fleet adapter opens an isolated SSH2 session and runs 'pm2 jlist'. The returned JSON output is parsed into process name, pm_id, memory usage, CPU % load, and uptime.",
      },
      {
        title: "3. Map Processes to Client Tenants",
        description:
          "Select discovered processes and link them to the target Client. Once mapped, the client gains restricted permissions to restart the process and view terminal logs from their portal or embeds.",
        caution: "Command injection payloads are strictly sanitized. Clients can never execute arbitrary commands or access unmapped server processes.",
      },
    ],
  },
  {
    id: "admin-domain-monitoring",
    category: "admin",
    badge: "Admin Runbook",
    title: "Domain Monitoring, SSL Handshake & Incident Alerts",
    summary:
      "Set up synthetic HTTP uptime checks, SSL certificate expiration alerts, DNS drift tracking, and automated incident escalation.",
    timeToRead: "5 min read",
    tags: ["domains", "ssl", "uptime", "incidents", "monitoring"],
    routeLink: "/admin/domains",
    steps: [
      {
        title: "1. Register Client Domain",
        description:
          "Navigate to Infrastructure -> Domains & SSL (/admin/domains). Enter the domain URL (e.g., https://app.example.com) and assign it to a client.",
      },
      {
        title: "2. Automated Checker Daemon Execution",
        description:
          "Background checkers run every 60 seconds: HTTP GET probes latency and HTTP 200 OK; TLS socket handshake inspects certificate valid_to dates; DNS resolver verifies A/CNAME records.",
      },
      {
        title: "3. False-Positive Protection & Incident Creation",
        description:
          "To avoid transient network blips, the monitoring engine enforces a consecutive failure threshold (default: 3 failed checks). Only after 3 consecutive errors is an Incident created and email notifications fired.",
        code: `// Incident threshold rule:
if (consecutiveFailures >= threshold && !existingIncident) {
  await incidentRepo.createIncident({
    domainId,
    type: "outage",
    severity: "critical"
  });
  await notificationService.sendAlertEmail(...);
}`,
        language: "typescript",
      },
    ],
  },
  {
    id: "admin-support-desk-sla",
    category: "admin",
    badge: "Admin Runbook",
    title: "Support Desk & 3-Tier SLA Escalation Engine",
    summary:
      "Manage client tickets, enforce 24x7 SLA clocks, dispatch internal staff notes vs public replies, and monitor automated SLA escalation.",
    timeToRead: "5 min read",
    tags: ["support", "tickets", "sla", "escalation"],
    routeLink: "/admin/support",
    steps: [
      {
        title: "1. Monitor Active SLA Clocks",
        description:
          "Open Platform Services -> Support Desk (/admin/support). Each ticket displays a live countdown timer tracking firstResponseDueAt and resolutionDueAt under 24x7 contractual terms.",
      },
      {
        title: "2. Public Client Replies vs Internal Staff Notes",
        description:
          "When submitting a reply, toggle 'Internal Note' to communicate privately with engineering team members. Internal notes are invisible to the client portal and embeds.",
      },
      {
        title: "3. 3-Tier SLA Escalation Workflow",
        description:
          "Tickets escalate through 3 levels: Level 1 (Support Engineer) -> Level 2 (Engineering Lead) -> Level 3 (Founder/Owner). Escalation occurs automatically when the SLA clock breaches, or manually by staff or client.",
      },
    ],
  },
  {
    id: "admin-vault-secrets",
    category: "admin",
    badge: "Admin Runbook",
    title: "Credential Vault & Audited Secret Sharing",
    summary:
      "Store client database strings, API credentials, and SSH keys encrypted at rest with audited reveal access and single-reveal policies.",
    timeToRead: "4 min read",
    tags: ["vault", "credentials", "secrets", "security"],
    routeLink: "/admin/vault",
    steps: [
      {
        title: "1. Add Credential to Vault",
        description:
          "Open Platform Services -> Vault (/admin/vault). Click '+ New Credential'. Provide Name, Category (Database, API, OAuth, SSH), Username, and Secret Value.",
      },
      {
        title: "2. Set Reveal Policies",
        description:
          "Optionally enable 'One-Time Reveal' (secret is destroyed or locked after first viewing) or set an expiration epoch.",
      },
      {
        title: "3. Audited Decryption Pipeline",
        description:
          "Every time an admin or client reveals a credential, the audit logger records actor ID, client ID, IP address, timestamp, and credential name in the immutable audit log table.",
      },
    ],
  },
  {
    id: "admin-smtp-settings",
    category: "admin",
    badge: "Admin Runbook",
    title: "Firm GST Settings & Gmail SMTP Delivery",
    summary:
      "Configure firm legal details, bank routing information, and encrypted Gmail App Passwords for transactional email dispatches.",
    timeToRead: "4 min read",
    tags: ["settings", "smtp", "email", "gmail", "bank"],
    routeLink: "/admin/settings",
    steps: [
      {
        title: "1. Input Firm Legal & Tax Entity Details",
        description:
          "In /admin/settings, enter Legal Entity Name, Registered Trade Name, GSTIN (e.g., 27AAAAA0000A1Z5), State Name, and State Code.",
      },
      {
        title: "2. Bank Account & Settlement Details",
        description:
          "Provide Bank Name, Account Number, IFSC Code, Branch, and UPI VPA ID. These details are rendered automatically onto generated client invoice PDFs and payment screens.",
      },
      {
        title: "3. Configure Gmail SMTP Delivery",
        description:
          "Input your sender address (e.g. notifications@rapidshiftlabs.com) and Google App Password (16-character token from Google Account Security). Test delivery with a single click.",
        tip: "Google App Passwords bypass 2FA safely for automated server mail delivery without OAuth re-authentication.",
      },
    ],
  },

  // ================= CLIENT PORTAL RUNBOOKS =================
  {
    id: "portal-live-embeds",
    category: "portal",
    badge: "Client Runbook",
    title: "In-Place Interactive Embeds (Zero Redirection)",
    summary:
      "How clients embed live interactive widgets directly into their own applications to let users settle invoices, restart servers, and reply to tickets without portal redirection.",
    timeToRead: "6 min read",
    tags: ["embeds", "in-place", "payments", "terminal", "interactive"],
    routeLink: "/portal/embeds",
    steps: [
      {
        title: "1. The In-Place Action Paradigm",
        description:
          "Unlike legacy widgets that redirect users to an external portal, RapidShift Embeds execute actions in-place: settling invoices triggers instant receipt verification; restarting PM2 servers runs with a live 60s cooldown; viewing terminal logs streams stdout directly inside the host page.",
      },
      {
        title: "2. Mint Scoped Embed Token",
        description:
          "In /portal/embeds, click 'Mint Embed Token'. Select allowed widgets (or select '*' for full dashboard) and choose expiration TTL (up to 365 days).",
        code: `// POST /api/v1/embeds/token
{
  "clientId": "cli_01M4KF1YVKPEAR7WNBNV4RYB67",
  "widget": "*",
  "ttlSeconds": 2592000
}`,
        language: "json",
      },
      {
        title: "3. Add Declarative Container to Your Web Page",
        description:
          "Insert the script tag in your document head or layout, then place a declarative div anywhere in your markup:",
        code: `<!-- 1. Include Script (Once) -->
<script src="https://controlplane.rapidshiftlabs.com/embed.js" async></script>

<!-- 2. Place Live Interactive Widget -->
<div 
  data-rsl-widget="billing-summary" 
  data-rsl-token="emb_YOUR_SCOPED_TOKEN"
  data-rsl-theme="dark"
  data-rsl-accent="#2563eb"
></div>`,
        language: "html",
      },
      {
        title: "4. Automatic Parent Iframe Auto-Resize",
        description:
          "RapidShift's embed.js listens for 'rsl-embed-resize' postMessage events from the widget iframe and dynamically resizes the container height. No nested scrollbars or clipping.",
      },
    ],
  },
  {
    id: "portal-access-gate-middleware",
    category: "portal",
    badge: "Client Runbook",
    title: "Client Access Gate & Fail-Open Resilient Middleware",
    summary:
      "Protect your Next.js proxy.ts or Express application with entitlement checking that halts traffic on dues while guaranteeing 100% fail-open uptime.",
    timeToRead: "6 min read",
    tags: ["gate", "middleware", "fail-open", "sdk", "security"],
    routeLink: "/portal/api-keys",
    steps: [
      {
        title: "1. Install RapidShift SDK or Use Native Fetch",
        description:
          "Add @rapidshift/sdk to your project, or invoke the high-throughput /api/v1/access/status HTTP endpoint inside your edge middleware.",
        code: `npm install @rapidshift/sdk`,
        language: "bash",
      },
      {
        title: "2. Integrate into Next.js middleware.ts / proxy.ts",
        description:
          "Wrap your request pipeline with createGate. The gate evaluates whether your contract is in good standing and checks client dues.",
        code: `import { createGate } from "@rapidshift/sdk";
import { NextResponse, type NextRequest } from "next/server";

const gate = createGate({
  apiKey: process.env.RAPIDSHIFT_API_KEY!,
  endpoint: "https://controlplane.rapidshiftlabs.com",
  cacheTtlMs: 60000, // 60s fast in-memory cache
  failOpen: true,     // CRITICAL: Guaranteed fail-open
});

export async function middleware(req: NextRequest) {
  // Allow static assets, health checks, and payment due screen
  if (req.nextUrl.pathname.startsWith("/_next") || req.nextUrl.pathname === "/due") {
    return NextResponse.next();
  }

  const { allowed, isBlocked, reason } = await gate.check();

  if (isBlocked) {
    return NextResponse.redirect(new URL("/due", req.url));
  }

  return NextResponse.next();
}`,
        language: "typescript",
      },
      {
        title: "3. Fail-Open Resilience Guarantee",
        description:
          "If the RapidShift VM undergoes maintenance or network latency spikes, gate.check() catches all exceptions, logs a warning, and returns { allowed: true, cached: true }. Your application and end-users NEVER experience downtime due to billing infrastructure.",
        tip: "Fail-open ensures client business continuity under any unforeseen control panel outage.",
      },
    ],
  },
  {
    id: "portal-pm2-operations",
    category: "portal",
    badge: "Client Runbook",
    title: "PM2 Fleet Operations & Live Terminal Logs",
    summary:
      "Restart application daemons with automatic 60-second cooldown protection and stream live stdout/stderr log output directly in the portal.",
    timeToRead: "4 min read",
    tags: ["pm2", "fleet", "terminal", "logs", "restart"],
    routeLink: "/portal/infrastructure",
    steps: [
      {
        title: "1. Monitor Running Daemons",
        description:
          "Navigate to Fleet & PM2 (/portal/infrastructure). Inspect your mapped services, uptime status, CPU consumption %, and memory footprint in Megabytes.",
      },
      {
        title: "2. Execute Safe Process Restart",
        description:
          "Click 'Restart'. The control panel executes a sanitized PM2 restart via the SSH adapter. A 60-second client-side cooldown activates immediately to prevent server flapping or restart loops.",
      },
      {
        title: "3. Inspect Live Terminal Logs",
        description:
          "Click 'Terminal Logs'. An in-place terminal modal renders the trailing 100 lines of standard output and error logs. Click 'Refresh' to inspect the latest daemon output.",
      },
    ],
  },
  {
    id: "portal-domain-health",
    category: "portal",
    badge: "Client Runbook",
    title: "Domain Health Checks & Instant SSL Verification",
    summary:
      "Review HTTP availability metrics, inspect SSL certificate validity, and trigger on-demand verification after deploying DNS updates.",
    timeToRead: "4 min read",
    tags: ["domains", "ssl", "dns", "health", "uptime"],
    routeLink: "/portal/domains",
    steps: [
      {
        title: "1. View Domain Status & Latency",
        description:
          "Open Domains & SSL (/portal/domains) to inspect real-time HTTP response times (ms), certificate validity countdown, and DNS synchronization.",
      },
      {
        title: "2. Trigger In-Place Domain Re-check",
        description:
          "After renewing an SSL certificate or modifying DNS records, click 'Re-check'. The control panel executes an instant synthetic probe and refreshes your badge without waiting for the next cron cycle.",
      },
    ],
  },
  {
    id: "portal-support-escalation",
    category: "portal",
    badge: "Client Runbook",
    title: "Raising Support Tickets & SLA Escalation",
    summary:
      "File critical tickets, participate in real-time conversation threads, and trigger contractual SLA escalation for high-priority production blockers.",
    timeToRead: "4 min read",
    tags: ["support", "tickets", "sla", "escalation"],
    routeLink: "/portal/support",
    steps: [
      {
        title: "1. Open Support Ticket",
        description:
          "Head to Support Desk (/portal/support) or use the embedded widget. Select Category (Technical, Billing, Account, Feature) and Priority (P1 Critical to P4 Low).",
      },
      {
        title: "2. Interactive Conversation Thread",
        description:
          "Communicate directly with engineering staff. Updates from engineers appear in your thread in real time.",
      },
      {
        title: "3. Trigger Urgent Escalation",
        description:
          "If an urgent production issue is blocked, click 'Escalate'. This advances the ticket to Tier 2 (Senior Lead) or Tier 3 (Founder/Owner) and notifies executive on-call engineers.",
      },
    ],
  },
  {
    id: "portal-vault-credential-reveal",
    category: "portal",
    badge: "Client Runbook",
    title: "Accessing Shared Credentials in the Vault",
    summary:
      "Safely reveal and copy shared production credentials, database connection strings, and third-party tokens with automated masking timers.",
    timeToRead: "3 min read",
    tags: ["vault", "credentials", "secrets", "security"],
    routeLink: "/portal/vault",
    steps: [
      {
        title: "1. Access Vault Secrets",
        description:
          "In /portal/vault, locate the required credential by category or search term.",
      },
      {
        title: "2. Click 'Reveal' for In-Place Decryption",
        description:
          "Clicking the Eye icon sends an authenticated reveal request. The secret is decrypted in memory and shown for 10 seconds before automatically re-masking.",
      },
      {
        title: "3. Audited Access Confirmation",
        description:
          "Your identity, timestamp, and IP are recorded in the security audit trail. One-click copy lets you paste directly into your .env file.",
      },
    ],
  },
  {
    id: "portal-analytics-offload",
    category: "portal",
    badge: "Client Runbook",
    title: "Cookieless Analytics & Telemetry Offloading",
    summary:
      "Deploy lightweight GDPR-compliant web analytics and stream HMAC-signed telemetry data directly to your own data warehouse or webhook endpoint.",
    timeToRead: "5 min read",
    tags: ["analytics", "telemetry", "webhooks", "gdpr", "offloading"],
    routeLink: "/portal/analytics",
    steps: [
      {
        title: "1. Add Cookieless Tracker Script",
        description:
          "Insert our ultra-lightweight (< 2 KB) tracking tag into your site's root layout:",
        code: `<script 
  defer 
  src="https://controlplane.rapidshiftlabs.com/t.js" 
  data-site="YOUR_CLIENT_ID"
></script>`,
        language: "html",
      },
      {
        title: "2. Privacy-Friendly Metrics Captured",
        description:
          "Tracks pageviews, unique sessions, referrers, device breakdown, and Core Web Vitals (LCP, FID, CLS) without setting cookies or storing personal identifiable information (PII).",
      },
      {
        title: "3. Configure Telemetry Offloading Webhook",
        description:
          "Provide your endpoint URL and shared secret. RapidShift streams telemetry batches via HTTP POST with an 'x-rsl-signature' HMAC-SHA256 header for verification.",
        code: `// Verifying incoming webhook signature in Node.js / Express:
const crypto = require("crypto");

function verifyRslWebhook(payload, signatureHeader, secret) {
  const hmac = crypto.createHmac("sha256", secret);
  const digest = "sha256=" + hmac.update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signatureHeader));
}`,
        language: "javascript",
      },
    ],
  },
];

const WIDGETS_CATALOG = [
  {
    id: "client-dashboard",
    title: "Client All-in-One Dashboard",
    category: "Master",
    desc: "Complete embedded control center with tabbed navigation: Billing, Fleet, Domains, and Support Desk with full in-place action handling.",
  },
  {
    id: "billing-summary",
    title: "Billing Summary Card",
    category: "Finance",
    desc: "Compact card rendering current balance due, next billing date, active retainer status, and one-click in-place invoice settlement modal.",
  },
  {
    id: "invoice-history",
    title: "Invoice History & Breakdown",
    category: "Finance",
    desc: "Full filterable invoice ledger with search, tax line-item breakdown, in-place payment processing, and PDF download triggers.",
  },
  {
    id: "payment-history",
    title: "Payment History & Receipts",
    category: "Finance",
    desc: "Verified transaction ledger showing payment methods, bank UTR references, amounts, and printable in-place settlement receipts.",
  },
  {
    id: "process-list",
    title: "PM2 Process Fleet & Live Logs",
    category: "Fleet",
    desc: "Interactive process table with real-time CPU/RAM meters, safe process restart with 60s cooldown timer, and embedded terminal log viewer.",
  },
  {
    id: "domain-status",
    title: "Domain Status & SSL Probing",
    category: "Monitoring",
    desc: "High-density availability monitor displaying HTTP uptime, SSL days-to-expire, DNS resolution, and on-demand synthetic re-check.",
  },
  {
    id: "ticket-desk",
    title: "Support Desk & SLA Threads",
    category: "Support",
    desc: "Complete support desk embed allowing clients to file new tickets with priority tiers, reply to conversation threads, and trigger SLA escalation.",
  },
  {
    id: "vault-secret",
    title: "Audited Vault Secret Viewer",
    category: "Security",
    desc: "Secure credential viewer with in-place audited reveal, auto-mask countdown timer, and clipboard copy utility.",
  },
];

export function ResourcesView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedRunbookId, setExpandedRunbookId] = useState<string | null>("admin-client-onboarding");
  const [copiedCodeSnippet, setCopiedCodeSnippet] = useState<string | null>(null);

  // Embed Playground State
  const [playgroundWidget, setPlaygroundWidget] = useState<string>("billing-summary");
  const [playgroundTheme, setPlaygroundTheme] = useState<"dark" | "light">("dark");
  const [playgroundAccent, setPlaygroundAccent] = useState<string>("#2563eb");
  const [playgroundFormat, setPlaygroundFormat] = useState<"script" | "webcomponent" | "iframe">("script");
  const [playgroundToken, setPlaygroundToken] = useState<string>("emb_sample_token_xyz");

  const filteredRunbooks = useMemo(() => {
    return RUNBOOKS.filter((rb) => {
      const matchesCategory =
        selectedCategory === "all" ||
        rb.category === selectedCategory ||
        (selectedCategory === "admin" && rb.category === "admin") ||
        (selectedCategory === "portal" && rb.category === "portal");

      const query = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !query ||
        rb.title.toLowerCase().includes(query) ||
        rb.summary.toLowerCase().includes(query) ||
        rb.tags.some((t) => t.toLowerCase().includes(query)) ||
        rb.steps.some(
          (s) => s.title.toLowerCase().includes(query) || s.description.toLowerCase().includes(query)
        );

      return matchesCategory && matchesQuery;
    });
  }, [searchQuery, selectedCategory]);

  const copyCode = (code: string, id: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopiedCodeSnippet(id);
      setTimeout(() => setCopiedCodeSnippet(null), 2000);
    }
  };

  // Generate Playground Code Snippet
  const generatedEmbedCode = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://controlplane.rapidshiftlabs.com";
    if (playgroundFormat === "script") {
      return `<!-- RapidShift Embed Script (Include Once) -->\n<script src="${origin}/embed.js" async></script>\n\n<!-- Target Live Widget Container -->\n<div\n  data-rsl-widget="${playgroundWidget}"\n  data-rsl-token="${playgroundToken}"\n  data-rsl-theme="${playgroundTheme}"\n  data-rsl-accent="${playgroundAccent}"\n></div>`;
    }
    if (playgroundFormat === "webcomponent") {
      return `<!-- RapidShift Embed Script -->\n<script src="${origin}/embed.js" async></script>\n\n<!-- Custom Web Component -->\n<rsl-${playgroundWidget}\n  token="${playgroundToken}"\n  theme="${playgroundTheme}"\n  accent="${playgroundAccent}"\n></rsl-${playgroundWidget}>`;
    }
    return `<!-- Isolated IFRAME Integration with Auto-Resize -->\n<iframe\n  src="${origin}/embed/${playgroundWidget}?token=${encodeURIComponent(playgroundToken)}&theme=${playgroundTheme}&accent=${encodeURIComponent(playgroundAccent)}"\n  style="width: 100%; border: none; min-height: 480px; border-radius: 16px; overflow: hidden;"\n  loading="lazy"\n></iframe>`;
  }, [playgroundWidget, playgroundTheme, playgroundAccent, playgroundFormat, playgroundToken]);

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 antialiased selection:bg-blue-500 selection:text-white pb-20">
      {/* Top Application Header */}
      <header className="sticky top-0 z-40 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-xl shadow-xs transition-colors">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10">
          <div className="h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link href="/admin" className="flex items-center gap-2.5 group transition-transform active:scale-98">
                <RapidShiftLogo size={34} />
                <div className="flex flex-col">
                  <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-white leading-none">
                    RapidShift<span className="text-blue-600 dark:text-blue-400">Labs</span>
                  </span>
                  <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 tracking-wider uppercase mt-0.5">
                    Engineering Resources & Runbooks
                  </span>
                </div>
              </Link>
            </div>

            {/* Quick Navigation Links */}
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/admin"
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
              >
                Admin Console
              </Link>
              <Link
                href="/portal"
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
              >
                Client Portal
              </Link>
              <Link
                href="/docs"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition shadow-xs"
              >
                <span>API Docs</span>
                <ExternalLink className="w-3 h-3 opacity-80" />
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Banner with Unified Professional Blue Theme */}
      <section className="relative overflow-hidden border-b border-zinc-200 dark:border-zinc-800 bg-gradient-to-b from-blue-50/50 via-slate-50 to-white dark:from-blue-950/20 dark:via-zinc-950 dark:to-zinc-900/60 py-12 sm:py-16">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Master Knowledge Base & Runbooks</span>
          </div>

          <div className="max-w-4xl space-y-3">
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
              Complete Operational Runbooks & Live Embed Masterclass
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400 text-base sm:text-lg leading-relaxed">
              Step-by-step documentation for every administrative capability and client service layer feature.
              Includes our zero-redirection in-place interactive embeds, fail-open access gate middleware, PM2 fleet operations, and telemetry pipelines.
            </p>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pt-2">
            <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xs">
              <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Admin Runbooks
              </span>
              <p className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">9 Guides</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Clients, GST, Fleet, SLA</p>
            </div>
            <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xs">
              <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Portal Runbooks
              </span>
              <p className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">7 Guides</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Embeds, Gate, Logs, Vault</p>
            </div>
            <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xs">
              <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Interactive Embeds
              </span>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">8 Widgets</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Zero Redirection In-Place</p>
            </div>
            <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xs">
              <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Access Gate
              </span>
              <p className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">100% Fail-Open</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Zero Client Downtime</p>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-10 space-y-12">
        {/* Search & Category Filter Navigation */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1 max-w-xl">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search runbooks by keyword (e.g. 'gst', 'fail-open', 'pm2 logs', 'embed', 'sla')..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition shadow-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Jump to Embed Playground Anchor */}
            <a
              href="#embed-playground"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white transition shadow-sm"
            >
              <Code2 className="w-4 h-4" />
              <span>Interactive Embed Playground</span>
            </a>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs font-semibold">
            {[
              { id: "all", label: "All Resources" },
              { id: "admin", label: "Admin Runbooks (9)" },
              { id: "portal", label: "Client Portal Runbooks (7)" },
              { id: "embeds", label: "Embed Masterclass" },
              { id: "gate", label: "Access Gate & SDK" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id)}
                className={`px-3.5 py-2 rounded-xl transition cursor-pointer shrink-0 ${
                  selectedCategory === tab.id
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Runbooks Accordion & Guide Cards */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              {selectedCategory === "admin"
                ? "Administrative Operations & Setup Runbooks"
                : selectedCategory === "portal"
                ? "Client Portal & Integration Runbooks"
                : "Operational Runbooks & Manuals"}
            </h2>
            <span className="text-xs font-semibold text-zinc-500 font-mono">
              Showing {filteredRunbooks.length} runbooks
            </span>
          </div>

          <div className="space-y-4">
            {filteredRunbooks.map((rb) => {
              const isExpanded = expandedRunbookId === rb.id;
              return (
                <div
                  key={rb.id}
                  className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                    isExpanded
                      ? "border-blue-500/40 bg-white dark:bg-zinc-900/90 shadow-md"
                      : "border-zinc-200 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40 hover:border-zinc-300 dark:hover:border-zinc-700"
                  }`}
                >
                  {/* Runbook Header */}
                  <div
                    onClick={() => setExpandedRunbookId(isExpanded ? null : rb.id)}
                    className="p-5 sm:p-6 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 select-none"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            rb.category === "admin"
                              ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20"
                              : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                          }`}
                        >
                          {rb.badge}
                        </span>
                        <span className="text-xs text-zinc-400 dark:text-zinc-500">&bull;</span>
                        <span className="text-xs text-zinc-500 font-medium">{rb.timeToRead}</span>
                      </div>
                      <h3 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
                        {rb.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-3xl">
                        {rb.summary}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      {rb.routeLink && (
                        <Link
                          href={rb.routeLink}
                          onClick={(e) => e.stopPropagation()}
                          className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1.5 transition"
                        >
                          <span>Open Tool</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                      <button
                        type="button"
                        className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
                        aria-label="Toggle details"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Step-by-Step Instructions */}
                  {isExpanded && (
                    <div className="border-t border-zinc-200/80 dark:border-zinc-800/80 p-5 sm:p-8 bg-zinc-50/50 dark:bg-zinc-950/40 space-y-6">
                      <div className="space-y-6">
                        {rb.steps.map((step, idx) => (
                          <div key={idx} className="space-y-3">
                            <div className="flex items-start gap-3">
                              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-extrabold shrink-0 mt-0.5">
                                {idx + 1}
                              </span>
                              <div className="space-y-1 flex-1">
                                <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                  {step.title}
                                </h4>
                                <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                                  {step.description}
                                </p>
                              </div>
                            </div>

                            {/* Optional Code Snippet */}
                            {step.code && (
                              <div className="ml-9 relative group rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-900 text-zinc-100">
                                <div className="flex items-center justify-between px-3.5 py-1.5 bg-zinc-950/80 border-b border-zinc-800 text-[11px] font-mono text-zinc-400">
                                  <span>{step.language || "text"}</span>
                                  <button
                                    onClick={() => copyCode(step.code!, `${rb.id}-step-${idx}`)}
                                    className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-100 transition cursor-pointer"
                                  >
                                    {copiedCodeSnippet === `${rb.id}-step-${idx}` ? (
                                      <>
                                        <Check className="w-3 h-3 text-emerald-400" />
                                        <span className="text-emerald-400 font-semibold">Copied!</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3" />
                                        <span>Copy Code</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                                <pre className="p-4 text-xs font-mono overflow-x-auto leading-relaxed text-zinc-200">
                                  <code>{step.code}</code>
                                </pre>
                              </div>
                            )}

                            {/* Optional Tip Callout */}
                            {step.tip && (
                              <div className="ml-9 p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 text-xs flex items-start gap-2.5">
                                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                                <span className="leading-relaxed">{step.tip}</span>
                              </div>
                            )}

                            {/* Optional Caution Callout */}
                            {step.caution && (
                              <div className="ml-9 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex items-start gap-2.5">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                <span className="leading-relaxed">{step.caution}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Tag Pills */}
                      <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800/80 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-zinc-400 mr-2">Tags:</span>
                        {rb.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-200/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ================= INTERACTIVE EMBEDS MASTERCLASS WORKBENCH ================= */}
        <section id="embed-playground" className="space-y-6 pt-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Interactive Developer Sandbox</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
              Live Embed Generator & Action Playground
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 text-xs sm:text-sm max-w-3xl leading-relaxed">
              Generate drop-in embed code for any client widget. All embeds execute operations in-place without navigating away to the portal. Test different themes, formats, and accents.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Controls & Code Generator (5 Cols) */}
            <div className="lg:col-span-5 space-y-6">
              <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 shadow-md space-y-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Widget Configuration
                </h3>

                {/* Widget Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    Select Live Widget
                  </label>
                  <select
                    value={playgroundWidget}
                    onChange={(e) => setPlaygroundWidget(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-500/40"
                  >
                    {WIDGETS_CATALOG.map((w) => (
                      <option key={w.id} value={w.id}>
                        [{w.category}] {w.title}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-zinc-500">
                    {WIDGETS_CATALOG.find((w) => w.id === playgroundWidget)?.desc}
                  </p>
                </div>

                {/* Theme & Accent Pickers */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Color Theme</label>
                    <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                      <button
                        type="button"
                        onClick={() => setPlaygroundTheme("dark")}
                        className={`flex-1 py-1 text-xs font-bold rounded-lg transition ${
                          playgroundTheme === "dark"
                            ? "bg-zinc-900 text-white shadow-xs"
                            : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                        }`}
                      >
                        Dark
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlaygroundTheme("light")}
                        className={`flex-1 py-1 text-xs font-bold rounded-lg transition ${
                          playgroundTheme === "light"
                            ? "bg-white text-zinc-900 shadow-xs"
                            : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                        }`}
                      >
                        Light
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Accent Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={playgroundAccent}
                        onChange={(e) => setPlaygroundAccent(e.target.value)}
                        className="w-9 h-9 rounded-xl border border-zinc-300 dark:border-zinc-700 cursor-pointer bg-transparent p-0.5"
                      />
                      <input
                        type="text"
                        value={playgroundAccent}
                        onChange={(e) => setPlaygroundAccent(e.target.value)}
                        className="flex-1 px-3 py-1.5 text-xs font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 uppercase"
                      />
                    </div>
                  </div>
                </div>

                {/* Token Mode */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    Scoped Token / Client Identifier
                  </label>
                  <input
                    type="text"
                    value={playgroundToken}
                    onChange={(e) => setPlaygroundToken(e.target.value)}
                    placeholder="emb_sample_token_xyz"
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                  <p className="text-[10px] text-zinc-500">
                    Leave blank to preview sample data, or paste an embed token minted from /portal/embeds.
                  </p>
                </div>

                {/* Output Snippet Format Tabs */}
                <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      Integration Code Format
                    </label>
                    <div className="flex items-center gap-1 text-[11px] font-semibold">
                      <button
                        onClick={() => setPlaygroundFormat("script")}
                        className={`px-2 py-0.5 rounded ${
                          playgroundFormat === "script" ? "bg-blue-600 text-white" : "text-zinc-500"
                        }`}
                      >
                        HTML
                      </button>
                      <button
                        onClick={() => setPlaygroundFormat("webcomponent")}
                        className={`px-2 py-0.5 rounded ${
                          playgroundFormat === "webcomponent" ? "bg-blue-600 text-white" : "text-zinc-500"
                        }`}
                      >
                        Web Comp
                      </button>
                      <button
                        onClick={() => setPlaygroundFormat("iframe")}
                        className={`px-2 py-0.5 rounded ${
                          playgroundFormat === "iframe" ? "bg-blue-600 text-white" : "text-zinc-500"
                        }`}
                      >
                        Iframe
                      </button>
                    </div>
                  </div>

                  <div className="relative group rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-900 text-zinc-100">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-950/80 border-b border-zinc-800 text-[11px] font-mono text-zinc-400">
                      <span>Snippet</span>
                      <button
                        onClick={() => copyCode(generatedEmbedCode, "playground-snippet")}
                        className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white transition cursor-pointer"
                      >
                        {copiedCodeSnippet === "playground-snippet" ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400 font-semibold">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy Snippet</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="p-3 text-[11px] font-mono overflow-x-auto leading-relaxed text-zinc-200 max-h-48">
                      <code>{generatedEmbedCode}</code>
                    </pre>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Live Interactive Preview Frame (7 Cols) */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold tracking-tight uppercase text-zinc-700 dark:text-zinc-300">
                    Live Interactive Preview Frame
                  </span>
                </div>
                <a
                  href={`/embed/${playgroundWidget}?theme=${playgroundTheme}&accent=${encodeURIComponent(
                    playgroundAccent
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <span>Open Fullscreen</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Responsive Container Emulating Third-Party Host Site */}
              <div className="rounded-2xl border-2 border-dashed border-zinc-300 dark:border-zinc-800 p-2 sm:p-4 bg-zinc-100/50 dark:bg-zinc-950/50">
                <div className="w-full bg-white dark:bg-zinc-950 rounded-xl overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-800">
                  {/* Fake Browser Top Chrome */}
                  <div className="h-8 px-4 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                    </div>
                    <span className="truncate max-w-xs">
                      https://client-production-app.com/dashboard/billing
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-bold">
                      IN-PLACE
                    </span>
                  </div>

                  {/* Rendered Live Embed Iframe */}
                  <iframe
                    key={`${playgroundWidget}-${playgroundTheme}-${playgroundAccent}`}
                    src={`/embed/${playgroundWidget}?theme=${playgroundTheme}&accent=${encodeURIComponent(
                      playgroundAccent
                    )}`}
                    title="RapidShift Embedded Widget Preview"
                    className="w-full min-h-[520px] border-0"
                    loading="lazy"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer Support Callout */}
        <section className="pt-8 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <p>
            RapidShift Labs &copy; {new Date().getFullYear()} &bull; Control Panel Documentation & Operational Runbooks
          </p>
          <div className="flex items-center gap-4 font-semibold">
            <Link href="/docs" className="hover:text-blue-600 dark:hover:text-blue-400 transition">
              Scalar API Explorer
            </Link>
            <Link href="/portal/support" className="hover:text-blue-600 dark:hover:text-blue-400 transition">
              Open Support Desk
            </Link>
            <a
              href="mailto:support@rapidshiftlabs.com"
              className="hover:text-blue-600 dark:hover:text-blue-400 transition"
            >
              Contact Engineering
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
