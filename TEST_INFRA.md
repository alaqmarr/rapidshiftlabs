# RapidShift Labs Control Plane — Test Infrastructure Specification (TEST_INFRA.md)

**Document Version:** 1.0.0  
**Author:** `e2e_test_writer_1` (E2E Test Suite Architect & Writer)  
**Status:** Approved & Active  
**Authoritative References:** `ORIGINAL_REQUEST.md`, `docs/APPROVED_PLAN.md`, `PROJECT.md`

---

## 1. Executive Summary & Testing Philosophy

The RapidShift Labs control plane is a mission-critical multi-tenant client service layer handling financial billing, server operations, domain uptime, support desk SLA, cookieless analytics, and access gating. To ensure bulletproof reliability and zero regressions, this test infrastructure enforces an opaque-box, progressive, 4-tier test architecture across all 100 features cataloged in `PROJECT.md`.

### The 4-Tier Test Methodology

| Tier | Category | Minimum Standard | Purpose & Scope |
|---|---|---|---|
| **Tier 1** | **Feature Coverage** | **≥ 5 tests per feature** | Primary functionality (happy path), input validation, contract fulfillment, and expected state transitions for every independent feature. |
| **Tier 2** | **Boundary & Corner Cases** | **≥ 5 tests per feature** | Extreme boundary conditions, month-end date clamping, leap years, empty strings, payload limits, command injection vectors, network drops, and error handling. |
| **Tier 3** | **Cross-Feature Interactions** | **Pairwise coverage** | Asynchronous domain event flows, transactional outbox dispatch, cross-context dependencies (Billing ↔ Entitlement, Fleet ↔ Support, Monitoring ↔ Support, Identity ↔ Tenant Isolation). |
| **Tier 4** | **Real-World Scenarios** | **Full business journeys** | Comprehensive multi-step operational workflows directly matching Acceptance Criteria from `ORIGINAL_REQUEST.md` (e.g. Overdue billing -> Gate blocks app -> Payment -> Allowed <5s; Portal down -> Fail-open). |

---

## 2. Test Architecture & Directory Layout

The automated testing infrastructure is structured into modular layers located in `tests/e2e` and co-located package tests:

```
rapidshiftlabs/
├── tests/
│   └── e2e/
│       ├── vitest.config.ts                  # Vitest test runner configuration for E2E
│       ├── fixtures/
│       │   ├── db-fixture.ts                 # 3-DB libSQL in-memory/file WAL setup with clean tables
│       │   ├── mock-ssh-pm2.ts               # RFC 4254 Mock SSH2 server emulating PM2 & metric probes
│       │   ├── mock-services.ts              # In-memory SMTP sink, mock RDAP, mock TLS, toggle HTTP server
│       │   └── client-app.fixture.ts         # Simulated client Next.js app integrating @rapidshift/sdk
│       ├── helpers/
│       │   ├── api-client.ts                 # Type-safe API client envelope & session authenticator
│       │   ├── sse-client.ts                 # EventSource / SSE reader asserting delivery within 3s
│       │   └── test-oracle.ts                # Deterministic oracles for GST, FY series, Money, and SLA
│       ├── tier1-features/
│       │   ├── identity-db.spec.ts           # M1: Features 1-16 (Admin/Client auth, 3-DB WAL, Outbox, SSE)
│       │   ├── billing-contracts.spec.ts     # M2: Features 17-37 (Contracts, Billing schedules, GST, Invoices)
│       │   ├── gate-entitlement.spec.ts      # M3: Features 38-51 (State machine, Ed25519 pass, JWKS, SDK gate)
│       │   ├── fleet-monitoring.spec.ts      # M4: Features 52-70 (PM2 actions, Metrics poller, SSL, DNS, RDAP)
│       │   └── support-analytics.spec.ts     # M5: Features 71-93 (SLA clock, Realtime thread, Ingest, Embeds)
│       ├── tier2-boundaries/
│       │   ├── billing-boundaries.spec.ts    # Date clamping, leap year, zero tax, invalid GSTIN, negative payments
│       │   ├── gate-boundaries.spec.ts       # Clock drift, expired tokens, forged Ed25519 signature, rate limits
│       │   ├── fleet-boundaries.spec.ts      # Command injection payloads (`rm -rf`, `;`, `&&`), unmapped process IDs
│       │   ├── support-boundaries.spec.ts    # SLA clock pause across holidays, rapid concurrent thread replies
│       │   └── monitoring-boundaries.spec.ts # N=2 vs N=3 threshold flapping, badssl wrong-host/expired certs
│       ├── tier3-interactions/
│       │   ├── billing-to-entitlement.spec.ts # Overdue invoice -> Grace/Restricted -> Payment -> Immediate Active
│       │   ├── fleet-to-support.spec.ts      # PM2 crash loop -> Auto system ticket opened -> Recovery resolves
│       │   ├── monitoring-to-support.spec.ts # Domain down incident -> System ticket -> Auto-resolve on recovery
│       │   ├── auth-tenant-isolation.spec.ts # Client A cannot access Client B; Admin cookie rejected on client URL
│       │   └── analytics-to-offload.spec.ts  # Raw event ingest -> Hourly rollup -> HMAC signed export push/pull
│       └── tier4-scenarios/
│           ├── rsl-full-lifecycle.e2e.spec.ts # Complete Acceptance Criteria workflow (Admin -> Gate -> Pay -> Resume)
│           ├── gate-failopen-recovery.e2e.spec.ts # Portal down fail-open verification and status badge
│           ├── fleet-ops-emulation.e2e.spec.ts # Discovery, client restart with cooldown, audit log verification
│           ├── embed-static-widgets.e2e.spec.ts # Static HTML snippet rendering live widgets
│           └── multi-process-concurrency.e2e.spec.ts # ≥2 OS processes, ≥50 concurrent read/writes, 0 SQLITE_BUSY
```

---

## 3. Test Runner Invocation & Verification Commands

All test runners use Vitest with native TypeScript execution on Node 22:

### Primary Execution Commands

```bash
# Run the entire E2E test suite (Tiers 1-4)
pnpm --filter @rsl/core exec vitest run --config ../../tests/e2e/vitest.config.ts

# Run Tier 1 Feature Coverage tests
pnpm --filter @rsl/core exec vitest run --config ../../tests/e2e/vitest.config.ts tests/e2e/tier1-features

# Run Tier 2 Boundary & Corner Case tests
pnpm --filter @rsl/core exec vitest run --config ../../tests/e2e/vitest.config.ts tests/e2e/tier2-boundaries

# Run Tier 3 Cross-Feature Interaction tests
pnpm --filter @rsl/core exec vitest run --config ../../tests/e2e/vitest.config.ts tests/e2e/tier3-interactions

# Run Tier 4 Real-World End-to-End Scenarios
pnpm --filter @rsl/core exec vitest run --config ../../tests/e2e/vitest.config.ts tests/e2e/tier4-scenarios

# Run Multi-Process SQLite Concurrency Stress Test
pnpm --filter @rsl/core exec vitest run --config ../../tests/e2e/vitest.config.ts tests/e2e/tier4-scenarios/multi-process-concurrency.e2e.spec.ts
```

---

## 4. Complete Feature Inventory Mapping (100 Features → Tiers 1-4)

Every single feature cataloged in `PROJECT.md` is strictly mapped below with its minimum test counts and coverage vectors:

### Milestone 1: Foundation, Data Layer & IAM (Features 1 – 16)

| # | Feature Name | M | Tier 1 Tests (≥5) | Tier 2 Tests (≥5) | Tier 3 Interaction | Tier 4 Scenario |
|---|---|---|---|---|---|---|
| 1 | Monorepo & Build Health | M1 | Clean build, typecheck, lint, exports, turbo pipeline | Circular deps, invalid workspace, missing tsconfig, broken symlinks, engine version | M1 ↔ M2 package imports | Full repo build & test runner check |
| 2 | Kernel Primitives | M1 | ULID generation, Money paise math, DateRange overlap, Actor assertion, Result Ok/Err | Money overflow, leap year range, negative paise, empty ULID prefix, invalid actor | Kernel ↔ All contexts | Multi-currency transaction processing |
| 3 | Triple SQLite libSQL Setup | M1 | `core.db`, `analytics.db`, `metrics.db` create, open, read, write, isolation | Disk full, invalid file path, unreadable permissions, corrupt header, foreign key violations | DB ↔ Outbox / Event dispatch | Concurrent multi-process database usage |
| 4 | Connection PRAGMA Factory | M1 | `busy_timeout=5000`, `synchronous=NORMAL`, `foreign_keys=ON`, `WAL`, `cache_size` | Non-WAL file rejected, zero timeout handling, read-only mode, custom cache size, connection retry | PRAGMA ↔ Connection pool | Stress test under lock contention |
| 5 | In-Process Write Mutex Queue | M1 | Mutex serializes 10 concurrent writes, read concurrency, fifo order, error recovery, unblock | Promise rejection in queue, queue starvation, write timeout, empty queue flush, lock release on exception | Mutex ↔ Outbox atomic commits | Zero `SQLITE_BUSY` during burst writes |
| 6 | BEGIN IMMEDIATE Transactions | M1 | Lock acquired up-front, rollbacks on error, commit success, nested tx handling, isolation | Deadlock prevention under concurrent upgrade, syntax error rollback, lock timeout, partial failure | UnitOfWork ↔ Repositories | High-frequency ledger mutations |
| 7 | Multi-Process Concurrency Test | M1 | 2 processes 50 ops, 3 processes 100 ops, mixed reads, mixed writes, WAL validation | Rapid spawn/kill process, abrupt disconnect, lock wait exceeded, huge batch writes, file handle exhaust | Process A ↔ Process B shared WAL | Multi-Process Concurrency Scenario AC |
| 8 | Transactional Outbox | M1 | Atomic event insert with aggregate, fetch pending, mark dispatched, order retention, retry count | Duplicate event ID, failed dispatcher retry, poison message skip, outbox batching, transaction rollback | Outbox ↔ SSE Hub / Webhooks | Full lifecycle domain event delivery |
| 9 | In-Process SSE Hub | M1 | Client subscribe, event broadcast, unsubscribe, topic filtering, <3s delivery | Dropped connection reconnect, Last-Event-ID resume, buffer limit, malformed topic, high subscriber count | Hub ↔ Ticket Thread / Billing | Realtime support updates without reload |
| 10 | NextAuth Admin Auth | M1 | Argon2id verify, correct password login, direct admin session claim (no TOTP) | Wrong password, brute force lockout, inactive admin user, empty credentials, SQL injection in email | Admin Auth ↔ Role-based routing | Admin login (email+password only) in full scenario |
| 11 | NextAuth Client Auth | M1 | Client user email login, isolated credential auth, client session claim, portal URL routing | Admin credentials rejected on client URL, client credentials rejected on admin URL, inactive client user | Client Auth ↔ Tenant Isolation | Separate URL login in E2E scenario |
| 12 | Session Version Revocation | M1 | `sv` match allows session, `sv` increment revokes, immediate 401 on next call, token update, multi-device | Replayed old session token, stale cache `sv`, concurrent revocation, expired JWT, invalid signature | Session ↔ Proxy guards | Instant sign-out everywhere |
| 13 | Proxy Host & Route Routing | M1 | Host header routing (`admin.`, `app.`, `api.`), dev path fallback, route protection, public bypass | Spoofed host header, unknown subdomain, path traversal, trailing slash normalization, case sensitivity | Proxy ↔ NextAuth session | Route isolation and gate protection |
| 14 | Architecture Boundary Check | M1 | Bounded context isolation, zero internal cross-context imports, domain layer purity, public API only | Violation detection on illegal import, deep barrel import blocked, framework import in domain blocked | ESLint ↔ Monorepo build | Monorepo CI verification check |
| 15 | Audit Log Infrastructure | M1 | Entity mutation logged, actor captured, client IP logged, reveal action recorded, immutable | Tamper detection, huge metadata payload, null actor handling, audit pagination, filter by date | Audit ↔ Vault / Billing / Fleet | Credential reveal audit verification |
| 16 | Worker Service Bootstrap | M1 | Worker starts, job registry initializes, graceful shutdown (SIGINT/SIGTERM), job loop, DB handle | Crashing job recovery, overlapping job execution prevention, unhandled rejection capture, clean exit | Worker ↔ Outbox / Metrics | Worker background poller lifecycle |

### Milestone 2: CRM, Contracts, Billing & Settings (Features 17 – 37)

| # | Feature Name | M | Tier 1 Tests (≥5) | Tier 2 Tests (≥5) | Tier 3 Interaction | Tier 4 Scenario |
|---|---|---|---|---|---|---|
| 17 | Company & Tax Settings | M2 | Save firm legal name, GSTIN, PAN, state code, address, bank details | Invalid GSTIN checksum, invalid PAN format, missing IFSC, special characters in address, state code mismatch | Settings ↔ GST Split Calculation | GST settings gating invoice creation |
| 18 | Encrypted Email Settings | M2 | Gmail SMTP config save, AES-256 encryption at rest, test email send, decrypt for worker, auth verify | Invalid SMTP port, wrong password decrypt error, TLS negotiation failure, timeout handling, null auth | Settings ↔ Nodemailer delivery | Email alert captured in test mail sink |
| 19 | Client CRUD & Contacts | M2 | Create client, update billing address, add primary contact, list clients, set timezone/currency | Duplicate client code, empty legal name, invalid email, non-existent client lookup, soft delete | Clients ↔ Contracts / Invoices | Client onboarding journey |
| 20 | Client User Accounts | M2 | Invite client user, set role (client_admin/member), accept invite, update profile, revoke access | Expired invite token, duplicate invite email, cross-client invite reuse, self-demotion block | Client Users ↔ IAM Realm | Client portal invitation & onboarding |
| 21 | Tenant Isolation Enforcer | M2 | Query scoped by clientId, assertTenant passes on matching client, cross-tenant throws 403, updates scoped | Attempted cross-tenant query bypass, SQL injection in clientId, missing tenant context, multi-tenant bulk op | Tenant ↔ Repositories | Cross-client isolation in Fleet/Billing |
| 22 | Contract Management | M2 | Create contract, set amount, currency, valid_from/to dates, billing cycle (monthly/quarterly), anchor day | valid_to before valid_from, negative amount, anchor day > 28, unsupported currency, zero tenure | Contracts ↔ Billing Periods | Contract creation in E2E scenario |
| 23 | Contract Lifecycle | M2 | Draft → Active transition, Active → Expired on valid_to, Renewal extends dates, Termination halts billing | Terminate already expired contract, activate without items, double activation, renew past tenure | Contracts ↔ Entitlement | Contract activation scheduling invoices |
| 24 | Billing Period Generator | M2 | Monthly period generation, quarterly periods, anchor day alignment, proration first period, tenure boundaries | Month-end clamping (Jan 31 -> Feb 28/29), leap year Feb 29, 31-day months, one-day contract, DST switch | Periods ↔ Invoice Generator | Auto billing period scheduling |
| 25 | Auto & Manual Invoices | M2 | Worker auto-generates invoice, admin creates manual invoice, line item calculations, subtotal match | Zero amount line item, 100+ line items, duplicate generation guard, manual invoice without contract | Invoices ↔ Outbox / Entitlement | Invoices created in E2E workflow |
| 26 | GST Split Calculation | M2 | Intra-state 9% CGST + 9% SGST, Inter-state 18% IGST, round paise, tax summary aggregation, SAC code | Union territory UTGST, zero-tax item, 1 paisa rounding edge case, invalid state code, reverse charge | GST ↔ Settings / Invoices | Tax invoice calculation verification |
| 27 | Non-GST Billing Mode | M2 | 0% tax invoice generated, separate series tag, non-GST client setting, no tax breakdown on PDF | Switch from GST to non-GST, export client zero tax, mixed tax items rejected, non-GST with tax lines | Non-GST ↔ FY Numbering | Non-GST invoice creation verification |
| 28 | GST Settings Gate | M2 | GST mode disabled when settings empty, enabled when GSTIN configured, validation error on create | Incomplete GST settings (missing state), corrupt GSTIN, settings revoked after invoice issued | Settings ↔ Invoices Gate | GST Settings Gate AC requirement |
| 29 | FY Invoice Numbering | M2 | Sequential `RSL/2026-27/0001`, separate series for Non-GST `RSL-NG/2026-27/0001`, financial year roll | Year boundary March 31 -> April 1, gapless sequence under concurrency, prefix customization, 9999 wrap | Numbering ↔ UnitOfWork | Financial Year invoice series verification |
| 30 | Invoice Immutability | M2 | Issued invoice edits blocked, status transition validation, line items locked, totals immutable | Attempted direct DB update rejected, voiding issued invoice allowed, credit note adjustment only | Invoices ↔ Audit Log | Immutability compliance verification |
| 31 | React-PDF Renderer | M2 | Generate invoice PDF buffer, stream download, render GST breakdown, render bank details, credit note PDF | Missing bank details fallback, long company names, Unicode characters, memory footprint on large PDF | PDF ↔ Client Portal download | Client downloads invoice PDF AC |
| 32 | Nodemailer Delivery | M2 | Send invoice email, send payment receipt, attach PDF, capture in test sink, retry on transport error | Mail server down retry, invalid recipient email, large PDF attachment, concurrent email queue | Delivery ↔ Outbox Dispatcher | Email notifications to test mail sink |
| 33 | Manual Payment Records | M2 | Record UPI payment, bank transfer, cash, cheque, record partial payment, balance decremented | Payment exceeding balance rejected, negative payment amount, duplicate transaction ID, zero payment | Payments ↔ Balance / Entitlement | Admin records payment in E2E scenario |
| 34 | Balance & Overdue State | M2 | Balance updates, full payment marks Paid, due date passed marks Overdue, partial payment updates balance | Overdue exactly at midnight UTC, paid on due date, overpayment attempt, clock advancing into overdue | Balance ↔ Entitlement Gate | Clock advance overdue in E2E scenario |
| 35 | Credit Notes | M2 | Issue credit note against invoice, update remaining balance, credit note numbering series, PDF export | Credit note exceeding invoice balance, credit note against draft invoice, credit note on void invoice | Credit Notes ↔ Revenue stats | Invoice adjustment and credit audit |
| 36 | Dunning Reminder Policy | M2 | Worker jobs for T-7, T-3, T-0, T+3 payment reminders, email dispatch, notification logged | Duplicate reminder prevention, paid invoice skipped, custom dunning schedule, weekend adjustment | Dunning ↔ Notifications | Dunning policy verification |
| 37 | Admin Revenue Dashboard | M2 | MRR/ARR calculation, total outstanding balance, overdue aging breakdown (0-30, 31-60), payment totals | Zero invoices empty state, multi-currency conversion, partial payments reflection, credit notes subtraction | Dashboard ↔ Billing aggregate | Revenue stats correctness |

### Milestone 3: Access Gate, API Platform & SDK (Features 38 – 51)

| # | Feature Name | M | Tier 1 Tests (≥5) | Tier 2 Tests (≥5) | Tier 3 Interaction | Tier 4 Scenario |
|---|---|---|---|---|---|---|
| 38 | Entitlement State Machine | M3 | Transitions: Active → Grace → Restricted → Suspended, restore to Active on payment, materialized read | Rapid state transitions, skipped grace days, overdue with 0 grace days, multiple overdue invoices | Entitlement ↔ Billing events | Gate state machine in E2E workflow |
| 39 | Admin Entitlement Overrides | M3 | Force-allow until date, force-block, maintenance mode, clear override restores materialized state | Expired force-allow date auto-reverts, force-allow with unpaid invoices, override audit logged | Overrides ↔ Gate check | Admin manual override verification |
| 40 | Public Access Gate Endpoint | M3 | `GET /api/v1/access/status`, returns status allowed/blocked, signed token, response <10ms | Bearer token missing, invalid secret key, unknown client, expired pass, high request burst | Gate ↔ LRU Cache | Gate endpoint sustains 200 req/s AC |
| 41 | Ed25519 Signed Passes | M3 | Generate asymmetric Ed25519 pass, 60s TTL, verify with public key, payload claims match | Tampered JWT payload rejected, expired pass rejected, wrong key signature fails, clock skew 5s | Passes ↔ JWKS endpoint | Client SDK pass verification |
| 42 | Public JWKS Endpoint | M3 | `GET /.well-known/jwks.json`, RFC 7517 compliant, returns Ed25519 public key, cache headers | Key rotation with dual keys, malformed request handling, rate limiting on JWKS, empty key ring guard | JWKS ↔ SDK verification | SDK downloads and verifies key |
| 43 | Fail-Open Gate Mechanism | M3 | RapidShift unreachable returns allowed (fail-open), status flag indicates offline, cached state used | DNS failure fallback, HTTP 500 error triggers fail-open, timeout triggers fail-open, reconnect restores live | Fail-Open ↔ SDK middleware | Portal stopped -> Fail-open AC |
| 44 | In-Memory LRU Cache | M3 | Cache hit serves <1ms, 60s TTL expiry, event-driven invalidation on payment, LRU eviction at max capacity | Cache stampede prevention, zero TTL handling, stale cache cleanup, concurrent cache read/write | Cache ↔ Entitlement events | High performance gate caching |
| 45 | API Key Platform | M3 | Create `rsk_` secret key, create `rpk_` publishable key, SHA-256 hash stored, reveal secret once | Revoked key rejected, expired key rejected, invalid prefix rejected, key collision guard | API Keys ↔ Authenticator | API Key verification across endpoints |
| 46 | Scoped API Permissions | M3 | Key with `billing:read` allowed, key missing `fleet:restart` returns 403, origin check for `rpk_` | IP allowlist check, spoofed origin header, wildcard scope handling, empty scopes rejected | Permissions ↔ API Routes | Scoped permissions enforcement |
| 47 | Token Bucket Rate Limiting | M3 | Rate limit headers (`X-RateLimit-*`), 100 req/min allowed, 101st returns 429 Too Many Requests | Burst capacity allowance, refill rate precision, per-IP rate limit for unauthenticated, per-key limit | Rate Limiter ↔ API Routes | Rate limiting defense verification |
| 48 | Webhook Platform | M3 | Register webhook endpoint, dispatch HMAC-SHA256 signed event, verify signature, retry on 5xx | Webhook endpoint timeout, exponential backoff retries, dead letter queue after max retries, SSRF block | Webhooks ↔ Outbox Dispatcher | Client webhook delivery verification |
| 49 | Public REST API Catalog | M3 | `/api/v1/billing/*`, `/servers`, `/tickets`, `/domains`, envelope format `{ data, meta }`, pagination | Malformed JSON request, unknown query params ignored, 404 envelope, 500 error envelope with requestId | API Catalog ↔ Bounded Contexts | 100% public route coverage test |
| 50 | RapidShift SDK Package | M3 | `@rapidshift/sdk` `createGate`, middleware routes allowed/blocked, redirects to `/payment-due` | Next.js 16 `proxy.ts` integration, Express middleware adapter, excluded routes (`/api/health`), pass cache | SDK ↔ Client demo app | Demo app gated in E2E scenario |
| 51 | SDK Fail-Open & Status | M3 | SDK detects server down, switches to fail-open, exposes RapidShift status component for dashboard | Intermittent network drops, status indicator updates via SSE, re-evaluation upon server recovery | SDK ↔ RapidShift Portal | SDK status badge in E2E scenario |

### Milestone 4: Fleet Ops & Domain Monitoring (Features 52 – 70)

| # | Feature Name | M | Tier 1 Tests (≥5) | Tier 2 Tests (≥5) | Tier 3 Interaction | Tier 4 Scenario |
|---|---|---|---|---|---|---|
| 52 | Server Registry | M4 | Register server (host, port, user `ubuntu`, SSH key), pin host fingerprint, test connection | Host fingerprint mismatch rejected, invalid SSH port, unreachable host, duplicate host/port | Servers ↔ SSH Pool | Server registration & probe |
| 53 | AES-256-GCM SSH Vault | M4 | Encrypt private key with master key, decrypt for SSH session, raw DB verification shows no plaintext | Wrong master key fails decrypt, corrupted ciphertext, empty private key, key version rotation | Vault ↔ DB Infrastructure | Stored SSH keys encrypted at rest AC |
| 54 | Persistent SSH2 Pool | M4 | Connection reuse for multiple commands, keepalive packet, multiplexed channels, connection timeout | Server drops connection, pool auto-reconnect with backoff, max channels reached queuing, pool teardown | Pool ↔ Mock SSH Server | Pooled SSH execution |
| 55 | PM2 Process Discovery | M4 | Execute `pm2 jlist`, parse JSON, map processes to client, record PID, uptime, memory, CPU | Empty PM2 list, malformed JSON response, PM2 daemon not running, 50+ processes parsed, offline process | Discovery ↔ Process registry | Discovery lists processes AC |
| 56 | Controlled PM2 Actions | M4 | Client restarts mapped process, client views logs `--lines 50`, cooldown enforced (60s), audit logged | Immediate second restart rejected by cooldown, non-allowlisted action rejected (`stop`, `delete`) | PM2 Actions ↔ Audit Log | Client restarts mapped process AC |
| 57 | Command Injection Defense | M4 | Validate process ID as integer, parameter injection rejected (`1; rm -rf`, `1 && cat /etc/passwd`), fixed template | Malformed `--lines` argument (`50; whoami`), Unicode injection, shell meta-characters (`|`, `$()`, backticks) | Injection Guard ↔ SSH Command | Command injection rejection AC |
| 58 | Fleet Authorization Isolation | M4 | Client A restarts own process 200 OK, Client A restarts Client B process returns 403 Forbidden | Client A requests Client B logs 403, unauthenticated user 401, non-existent process 404 | Auth Isolation ↔ Tenant Context | Cross-client process 403 Forbidden AC |
| 59 | Local Mock SSH/PM2 Daemon | M4 | RFC 4254 SSH server starts, authenticates public key, handles `pm2 jlist`, handles restart & logs | Rejects bad SSH credentials, handles stream EOF, channel close, emulates process crash loop, metrics | Mock SSH ↔ Fleet Tests | Local Mock SSH server test suite AC |
| 60 | Worker Metrics Poller | M4 | 30s probe reads CPU, meminfo, loadavg, writes to `metrics.db`, PM2 process stats recorded | Probe timeout handling, disk full in `metrics.db`, non-blocking worker execution, rollups generated | Metrics ↔ Worker Service | Background metrics collection |
| 61 | Crash-Loop & Down Alerts | M4 | PM2 restart surge detected (>5 restarts/min), server down detected, incident notification emitted | Transient single restart ignored, server recovery cancels alert, alert throttling (1 alert/hour) | Alerts ↔ Support Tickets / Email | Crash-loop system ticket generation |
| 62 | MonitoredDomain Aggregate | M4 | Register client domain, configure check intervals (HTTP 1m, SSL 6h, DNS 15m), link to client | Invalid domain hostname, duplicate domain, localhost/private IP blocked (SSRF guard), international domain | Domain ↔ Client CRM | Domain registration & status |
| 63 | HTTP Uptime Checker | M4 | `undici` probes URL, 200 OK recorded, response time measured, redirect followed (max 3), keyword match | 500 Internal Error recorded, connection timeout (5s), SSL handshake failure, infinite redirect loop halted | Checker ↔ Metrics DB | HTTP uptime check execution |
| 64 | TLS/SSL Validity Checker | M4 | `tls.connect` checks cert expiry, issuer, SAN matches hostname, TLS 1.3 protocol verified | Expired cert flagged, expiring in 14 days warning, self-signed cert rejected, revoked cert detection | Checker ↔ Incident Engine | SSL expiry check verification |
| 65 | badssl.com Test Cases | M4 | `expired.badssl.com` detected as expired, `wrong.host.badssl.com` detected as hostname mismatch | `self-signed.badssl.com` detected, `untrusted-root.badssl.com` detected, network offline handling | Checker ↔ badssl oracle | badssl.com acceptance criteria AC |
| 66 | DNS Drift Checker | M4 | `dns/promises` resolves A/AAAA/CNAME/MX, matches baseline records, records drift on change | NXDOMAIN resolution failure, DNS server timeout, missing MX record warning, TTL change ignored | Checker ↔ Domain snapshots | DNS drift detection verification |
| 67 | RDAP Registration Expiry | M4 | Query RDAP bootstrap registry, parse expiration date, registrar name, registrar status flags | RDAP 404 for unknown TLD, rate limit 429 from registry, domain expiring in 30 days alert, WHOIS fallback | Checker ↔ Domain notifications | Real domain RDAP expiry check AC |
| 68 | False-Positive Protection | M4 | Failures 1 & 2 do NOT open incident, 3rd consecutive failure opens incident, recovery clears count | Flapping status (fail-pass-fail), second network probe confirmation, transient 502 recovery | Protection ↔ Incident Engine | N=3 consecutive failure AC |
| 69 | Incident Automation | M4 | Incident opened on confirmed down, auto-resolved on recovery, duration tracked, email alert sent | Open incident prevents duplicate, incident timeline events recorded, notification captured in sink | Incidents ↔ Support / Mail | Incident auto-open & resolve AC |
| 70 | Public Status Pages | M4 | `/status/[clientSlug]` displays uptime bars, current status, active incidents, 90-day history | Private client status hidden, non-existent slug 404, maintenance window banner, fast cached response | Status Page ↔ Metrics / Incidents | Public status page verification |

### Milestone 5: Support Desk, Analytics & Embeds (Features 71 – 93)

| # | Feature Name | M | Tier 1 Tests (≥5) | Tier 2 Tests (≥5) | Tier 3 Interaction | Tier 4 Scenario |
|---|---|---|---|---|---|---|
| 71 | Ticket Aggregate & Workflow | M5 | Create ticket (P1-P4, L1-L3), transitions Open → InProgress → Resolved → Closed, assign staff | Reopen closed ticket, invalid status transition, empty subject/body, priority downgrade validation | Tickets ↔ Realtime SSE | Client raises ticket in E2E scenario |
| 72 | 24x7 SLA Clock Engine | M5 | First-response SLA timer, resolution SLA timer, countdown calculation, SLA breach detection | Clock pause in `WaitingOnClient`, clock resumes on client reply, weekend computation, boundary breach | SLA Engine ↔ Worker escalator | SLA clock breach calculation |
| 73 | 3-Tier Escalation Matrix | M5 | Auto escalation on SLA breach L1→L2→L3, manual staff escalation, client-initiated escalation | Client escalate before cooldown blocked, already L3 cannot escalate further, escalation notification sent | Escalation ↔ Staff reassign | SLA forced breach auto-escalate AC |
| 74 | Auto System Tickets | M5 | Domain down incident auto-opens system ticket, server down auto-opens ticket, auto-resolved on fix | Incident already linked does not duplicate, manual close before incident recovery, incident reopened | System Tickets ↔ Incidents | System ticket lifecycle |
| 75 | Realtime Support Thread | M5 | Add public reply, add internal note (hidden from client), SSE pushes update to both screens <3s | Client attempt to read internal note 403, concurrent messages order preserved, markdown formatting | Thread ↔ In-Process SSE Hub | Realtime reply in 3s in E2E scenario |
| 76 | Ephemeral Presence & Typing | M5 | Typing indicator published to SSE, viewer presence ("User is viewing"), ephemeral (not in DB) | Stale presence auto-expires (10s), high-frequency typing debounce, client leaves ticket updates presence | Presence ↔ SSE Hub | Live presence indicator check |
| 77 | Secure File Attachments | M5 | Upload attachment, validate mime type (PNG, PDF, TXT), size limit (10MB), signed download URL | Executable upload rejected (`.exe`, `.sh`), path traversal in filename, expired download URL returns 403 | Attachments ↔ Storage adapter | File attachment upload/download |
| 78 | Canned Replies & CSAT | M5 | Select canned reply, insert into thread, post-resolution CSAT prompt (1-5 stars), CSAT feedback save | CSAT on unclosed ticket rejected, duplicate CSAT rejected, search canned replies by shortcut | Canned / CSAT ↔ Metrics | Support satisfaction tracking |
| 79 | Cookieless Analytics Tracker | M5 | Script <2KB, sends beacon to `/api/collect`, daily rotating salt hash visitor ID, pageview event | Tracker script loaded async, offline beacon queued, referrer captured, UTM tags parsed, SPA navigation | Tracker ↔ Ingest API | Tracker generates events in AC |
| 80 | Analytics Ingest Pipeline | M5 | `/api/collect` parses batch, validates publishable key, origin header check, sustains ≥1k evt/s | Spoofed origin rejected, bot user-agent filtered, invalid JSON payload, burst traffic memory buffer | Ingest ↔ Analytics DB | 1,000 events/s sustained ingest AC |
| 81 | Core Web Vitals & Events | M5 | Ingest LCP, INP, CLS, FCP, TTFB metrics, custom event `rsl.track('signup')`, JS error tracking | Negative vital metric rejected, huge custom event payload truncated, unhandled error stack trace | Vitals ↔ Dashboards | Web vitals reflected in dashboards |
| 82 | Rollup & Retention Worker | M5 | Hourly rollups created, daily rollups created, raw events older than 60 days deleted, rollups kept | Retention job runs during quiet hours, rollups match raw count exactly, incremental vacuum on DB | Retention ↔ Analytics DB | 60-day raw retention pruning AC |
| 83 | Client Analytics Offload | M5 | HMAC-SHA256 signed batched push to client webhook, pull export API (`GET /v1/analytics/export`) | Offload receiver offline retry with backoff, cursor pagination on pull export, secret key rotation | Offload ↔ Client Receiver | Client analytics offload AC |
| 84 | Preact Web Components | M5 | `<rsl-billing-summary>` Shadow DOM renders, style isolation, scoped CSS, updates on token refresh | Script failed load fallback, invalid token shows error card, theme prop (`dark`/`light`) applied | Embeds ↔ Web Components | Live widget renders on static HTML AC |
| 85 | iframe Fallback Embeds | M5 | `/embed/[widget]` renders shadcn component, responsive iframe, CSP allows embedding on client host | Disallowed embedding origin blocked by X-Frame-Options/CSP, widget token validation, print view | iframe ↔ Portal Routes | iframe embed rendering |
| 86 | Scoped Embed Tokens | M5 | Mint `emb_` token with scope (`billing:read`, `ticket:create`), 15m TTL, verify token on embed fetch | Expired embed token rejected, scope violation (billing token accessing tickets 403), forged token | Tokens ↔ Embed APIs | Scoped token minting & validation |
| 87 | 23-Widget Embed Catalog | M5 | All 23 advertised widgets render real data (billing, servers, domains, tickets, analytics, full portal) | Empty data states for all widgets, loading skeletons, network retry button, error boundary fallback | Catalog ↔ Application APIs | All advertised widgets verified AC |
| 88 | Embed Studio | M5 | In-portal interactive preview, theme customization, generates HTML, React, and iframe snippets | Copy-to-clipboard snippet matches runtime, responsive preview breakpoint toggle, code syntax highlight | Studio ↔ Presentation UI | In-portal Embed Studio verification |
| 89 | Credentials Vault | M5 | Store credentials (DB, API, SMTP) encrypted AES-256, list metadata (no secret), reveal logs audit | Reveal without permission 403, reveal reason required, one-time reveal burn, expired credential | Vault ↔ Audit Log | Credential reveal audited AC |
| 90 | Release Links | M5 | Add project release link (beta, staging, prod), version string, release notes, optional password | Expired release link auto-disabled, invalid URL format rejected, password verification for link access | Releases ↔ Client Portal | Release links management |
| 91 | Admin Console UI | M5 | Render `/admin/*` pages, navigation, stats cards, tables with sorting/filtering, modal dialogs | Unauthenticated redirect to `/admin/login`, role permission hiding unauthorized menus, dark mode | Admin UI ↔ Server Actions | Admin console operational flows |
| 92 | Client Portal UI | M5 | Render `/portal/*` pages on client URL, billing countdown, tickets inbox, server list, domains | Client user cannot see other clients' data, mobile responsive layout, realtime SSE connection active | Client UI ↔ Public APIs | Client portal operational flows |
| 93 | Client/Admin Cookie Isolation | M5 | Admin session cookie (`__Secure-rsl-admin`) not valid on `/portal/*`, Client cookie not valid on `/admin/*` | Cookie tampering rejected, cross-realm session hijacking blocked, path/domain attribute scoping | Cookie Isolation ↔ Proxy | Admin/Client cookie isolation AC |

### Milestone 6: Docs, Deployment & Final Acceptance (Features 94 – 100)

| # | Feature Name | M | Tier 1 Tests (≥5) | Tier 2 Tests (≥5) | Tier 3 Interaction | Tier 4 Scenario |
|---|---|---|---|---|---|---|
| 94 | OpenAPI 3.1 Spec Generator | M6 | Generates spec from Zod contracts, all endpoints included, parameters, schemas, responses | Validate generated spec against OpenAPI 3.1 schema, missing description warning, enum values match | OpenAPI ↔ Contracts | 100% route coverage check AC |
| 95 | Scalar API Reference UI | M6 | `/docs/api` renders Scalar explorer, interactive request runner, code snippets (curl, TS, fetch) | Deep linking to endpoints, search filter by tag, dark mode rendering, responsive layout | Scalar ↔ OpenAPI Spec | Interactive API documentation |
| 96 | Fumadocs Guides | M6 | Render integration guides: Gate setup, Analytics tracker, Embeds, Webhook verification, SDK | Broken internal links check, MDX syntax validation, code block copy button, mobile navigation | Docs ↔ Portal Routes | Full integration documentation |
| 97 | Ubuntu Deployment Guide | M6 | `docs/DEPLOYMENT.md` contains every command for Nginx, Let's Encrypt, PM2, DB migrations, env vars | Automated linter verifies every env var explained, backup/restore runbook verified, rollback steps | Guide ↔ VM Architecture | VM runbook followable AC |
| 98 | Automated Architecture Check | M6 | ESLint boundaries rule verifies 0 illegal cross-context imports, domain layer has 0 external deps | Illegal import test triggers CI build failure, public index.ts import succeeds, infrastructure rule | Boundaries ↔ Build System | Architecture boundary check AC |
| 99 | Full E2E Browser Test | M6 | Admin login → Client/Contract/Invoice → Overdue → Gate block → Pay → Allowed <5s; Support ticket | Ticket escalation on SLA breach, client downloads invoice PDF, portal down fail-open | E2E Suite ↔ Whole Monorepo | Full End-to-End browser scenario AC |
| 100 | Adversarial Coverage Hardening | M6 | Tier 5 challenger tests: SQL injection, path traversal, race conditions, memory leaks, rapid restart | High-concurrency DDOS simulation, malformed cryptographic packets, corrupted WAL recovery | Hardening ↔ Security Invariants | Final Acceptance Hardening |

---

## 5. Acceptance Criteria Verification Matrix

| Acceptance Criteria Item (from ORIGINAL_REQUEST.md) | Authoritative Verification Suite | Target Threshold / Assertion |
|---|---|---|
| **Build & Health: Clean install, build, typecheck, lint** | Monorepo CI verification script | Zero exit code, 0 type errors, 0 lint warnings |
| **Data Concurrency: Multi-process WAL test** | `tests/e2e/tier4-scenarios/multi-process-concurrency.e2e.spec.ts` | ≥2 OS processes, ≥50 mixed read/writes, 0 `SQLITE_BUSY`, WAL confirmed |
| **R1 Billing: Period generation, month-end clamping** | `tests/e2e/tier1-features/billing-contracts.spec.ts` & `tier2-boundaries/billing-boundaries.spec.ts` | Jan 31 -> Feb 28/29 clamped, tenure boundaries exact |
| **R1 Billing: GST split (CGST+SGST vs IGST) & Non-GST** | `tests/e2e/tier1-features/billing-contracts.spec.ts` | 9%+9% intra-state, 18% inter-state, 0% non-GST, FY sequential series |
| **R1 Billing: GST Settings Gate** | `tests/e2e/tier1-features/billing-contracts.spec.ts` | GST mode unavailable until firm legal details & GSTIN set |
| **E2E Scenario: Admin -> Invoice Overdue -> Gate Block -> Pay -> Unblock <5s** | `tests/e2e/tier4-scenarios/rsl-full-lifecycle.e2e.spec.ts` | Gate returns `blocked`, payment recorded, gate returns `allowed` within 5 seconds |
| **E2E Scenario: Fail-open when RapidShift portal stopped** | `tests/e2e/tier4-scenarios/gate-failopen-recovery.e2e.spec.ts` | Server stopped, client demo app remains accessible, status badge displays offline |
| **E2E Scenario: Client URL login, invoice PDF download, cookie isolation** | `tests/e2e/tier4-scenarios/rsl-full-lifecycle.e2e.spec.ts` & `tier3-interactions/auth-tenant-isolation.spec.ts` | Client downloads valid PDF; Admin session cookie rejected on client URL and vice versa |
| **E2E Scenario: Ticket raised -> Admin sees <3s; Reply <3s; SLA auto-escalate** | `tests/e2e/tier4-scenarios/rsl-full-lifecycle.e2e.spec.ts` & `tier1-features/support-analytics.spec.ts` | SSE pushes ticket to admin in <3s; admin reply pushed to client in <3s; SLA breach auto L2 |
| **R2 Fleet: Process discovery, restart cooldown, audit log** | `tests/e2e/tier4-scenarios/fleet-ops-emulation.e2e.spec.ts` | `pm2 jlist` discovered; restart succeeds; 2nd restart blocked by cooldown; audit verified |
| **R2 Fleet: Cross-client isolation (403), injection rejection** | `tests/e2e/tier2-boundaries/fleet-boundaries.spec.ts` | Client A accessing Client B process returns 403; command injection payloads rejected |
| **R2 Fleet: Stored SSH keys & secrets encrypted at rest** | `tests/e2e/tier1-features/fleet-monitoring.spec.ts` | Raw DB inspection of `servers.private_key` confirms ciphertext, no plaintext |
| **R4 Monitoring: BadSSL cert checks, consecutive failure N=3 threshold** | `tests/e2e/tier1-features/fleet-monitoring.spec.ts` & `tier2-boundaries/monitoring-boundaries.spec.ts` | Expired & wrong-host certs flagged; incident opens only on 3rd failure; recovers on 200 OK |
| **R4 Monitoring: Real domain RDAP registration expiry** | `tests/e2e/tier1-features/fleet-monitoring.spec.ts` | RDAP query fetches expiration date & registrar for registered domain |
| **R5 Analytics: Cookieless tracker, 60-day raw retention** | `tests/e2e/tier1-features/support-analytics.spec.ts` | Pageviews & web vitals ingested; events older than 60 days deleted; rollups preserved |
| **R5 Analytics: Offload signed push & pull export** | `tests/e2e/tier3-interactions/analytics-to-offload.spec.ts` | Batched events delivered to webhook with valid HMAC-SHA256; pull API returns same |
| **R5 Embeds: Static HTML renders live widgets** | `tests/e2e/tier4-scenarios/embed-static-widgets.e2e.spec.ts` | Static HTML snippet renders billing, processes, domains, and tickets live |
| **R6 Docs: 100% public API routes covered in spec** | `tests/e2e/tier1-features/identity-db.spec.ts` | 100% of endpoints have request schema, response schema, errors, examples |
| **Performance: Gate 200 req/s <10ms; Analytics 1k evt/s** | `tests/e2e/tier1-features/gate-entitlement.spec.ts` & `support-analytics.spec.ts` | Gate p99 < 10ms sustained at 200 req/s; Ingest handles ≥ 1,000 events/s |

---

## 6. Test Oracles & Derivation of Expected Outputs

Every test assertion is grounded in a deterministic, authoritative oracle:

1. **GST Calculation Oracle**:
   - Intra-state (Client State == Firm State): $\text{CGST} = \text{round}(\text{Subtotal} \times 0.09)$, $\text{SGST} = \text{round}(\text{Subtotal} \times 0.09)$, $\text{Total} = \text{Subtotal} + \text{CGST} + \text{SGST}$.
   - Inter-state (Client State $\neq$ Firm State): $\text{IGST} = \text{round}(\text{Subtotal} \times 0.18)$, $\text{Total} = \text{Subtotal} + \text{IGST}$.
   - Non-GST Mode: $\text{Tax} = 0$, $\text{Total} = \text{Subtotal}$.
2. **Financial Year Series Oracle**:
   - For an invoice created on date $D$: if $\text{Month}(D) \ge 4$, $FY = \text{Year}(D)\text{-}(\text{Year}(D)+1 \pmod{100})$; else $FY = (\text{Year}(D)-1)\text{-}(\text{Year}(D) \pmod{100})$.
   - Sequential sequence padded to 4 digits (`0001`, `0002`...).
3. **Month-End Date Clamping Oracle**:
   - Given anchor day $A=31$, for month $M$: target day is $\min(A, \text{daysInMonth}(M, Y))$. E.g., for February in non-leap year: day 28; leap year: day 29.
4. **Ed25519 Cryptographic Oracle**:
   - Asymmetric JWT pass signed with Ed25519 private key. Public key exposed via JWKS format (RFC 7517) containing `kty: "OKP"`, `crv: "Ed25519"`, `x: "<base64url>"`.
5. **SQLite WAL Concurrency Oracle**:
   - 3 separate physical DB files. Under `PRAGMA journal_mode = WAL` and write serialization via in-process mutex and `BEGIN IMMEDIATE`, concurrent reads and writes across processes never produce `SQLITE_BUSY`.

---

## 7. Progressive Testability & Milestone Dependencies

Tests are designed to be run progressively as implementation milestones land:
- **Milestone 1**: Verifies `tier1-features/identity-db.spec.ts` and `tier4-scenarios/multi-process-concurrency.e2e.spec.ts`.
- **Milestone 2**: Verifies `tier1-features/billing-contracts.spec.ts` and `tier2-boundaries/billing-boundaries.spec.ts`.
- **Milestone 3**: Verifies `tier1-features/gate-entitlement.spec.ts`, `tier2-boundaries/gate-boundaries.spec.ts`, and `tier3-interactions/billing-to-entitlement.spec.ts`.
- **Milestone 4**: Verifies `tier1-features/fleet-monitoring.spec.ts`, `tier2-boundaries/fleet-boundaries.spec.ts`, `tier2-boundaries/monitoring-boundaries.spec.ts`, and `tier4-scenarios/fleet-ops-emulation.e2e.spec.ts`.
- **Milestone 5**: Verifies `tier1-features/support-analytics.spec.ts`, `tier2-boundaries/support-boundaries.spec.ts`, `tier3-interactions/fleet-to-support.spec.ts`, `tier3-interactions/monitoring-to-support.spec.ts`, and `tier4-scenarios/embed-static-widgets.e2e.spec.ts`.
- **Milestone 6**: Verifies `tier4-scenarios/rsl-full-lifecycle.e2e.spec.ts` and `tier4-scenarios/gate-failopen-recovery.e2e.spec.ts`.
