# Architecture & Domain-Driven Design (DDD) Guide

The **RapidShift Control Plane** is built on the principles of **Domain-Driven Design (DDD)** and Clean Architecture. This document outlines the monorepo structure, the 15 bounded contexts, layer boundaries, transactional event dispatch, and concurrency handling in the SQLite data layer.

---

## 1. Clean Layering Rules

Every bounded context under `packages/core/src/modules/` adheres to a strict 3-tier layering model:

```
┌────────────────────────────────────────────────────────┐
│  Infrastructure Layer (infrastructure/)                │
│  - Drizzle ORM Schemas                                 │
│  - SQLite Repositories & SQL Queries                   │
│  - External Adapters (SSH2, Nodemailer, DNS, TLS)      │
└──────────────────────────┬─────────────────────────────┘
                           │ implements ports
                           ▼
┌────────────────────────────────────────────────────────┐
│  Application Layer (application/)                      │
│  - Use Cases & Commands                                │
│  - Input/Output DTOs & Validation Contracts            │
│  - Ports (Repository & Service Interfaces)             │
└──────────────────────────┬─────────────────────────────┘
                           │ orchestrates
                           ▼
┌────────────────────────────────────────────────────────┐
│  Domain Layer (domain/)                                │
│  - Pure TypeScript Entities & Aggregates               │
│  - Value Objects (Money, Email, ULID, DateRange)       │
│  - Domain Events & Invariants                          │
│  - ZERO external framework, DB, or network packages    │
└────────────────────────────────────────────────────────┘
```

### Architectural Invariants Enforced by CI
1. **Zero Framework Dependencies in Domain**: Files in `domain/` and shared kernel never import `@libsql`, `drizzle-orm`, `next`, `react`, `ssh2`, or network packages.
2. **Zero Cross-Context Internal Imports**: A bounded context (e.g. `billing`) must never import internals of another bounded context (e.g. `import from "../clients/domain/..."`). Communication across contexts occurs exclusively via the public module interface (`index.ts`) or asynchronous domain events.

---

## 2. The 15 Bounded Contexts

| # | Bounded Context | Scope & Responsibility |
|---|---|---|
| 1 | `identity` | User accounts, credentials, password hashing (Argon2id), roles (owner, staff, client) |
| 2 | `clients` | Tenant client accounts, company legal details, currencies, and client user mapping |
| 3 | `contracts` | Contracts lifecycle (Draft, Active, Terminated), tenure dates, billing schedules |
| 4 | `billing` | Invoicing (GST/non-GST), sequential FY numbering, balance calculation, and payments |
| 5 | `entitlement` | Access gate state machine (Active, Grace, Restricted, Blocked) & Ed25519 passes |
| 6 | `fleet` | Server registry, persistent SSH2 pool, PM2 process discovery, restart, and telemetry |
| 7 | `monitoring` | Monitored domains, HTTP uptime probes, TLS/SSL validity, DNS drift, and incidents |
| 8 | `support` | 24x7 SLA support tickets, replies, internal notes, 3-tier escalation, and CSAT |
| 9 | `analytics` | Cookieless visitor tracking, pageviews, Core Web Vitals, rollups, and offloading |
| 10 | `vault` | AES-256-GCM encrypted client credentials with audited secret reveal actions |
| 11 | `releases` | Client release links, staging URLs, beta build artifacts, and release notes |
| 12 | `api-platform` | Client secret API keys (`rsk_...`), publishable keys (`rpk_...`), and scopes |
| 13 | `embeds` | Preact Shadow DOM web components, 23-widget catalog, and scoped embed tokens |
| 14 | `notifications`| Email templating and Nodemailer delivery for invoices, alerts, and invitations |
| 15 | `audit` | Append-only immutable audit trail for security mutations and secret reveals |

---

## 3. Data Layer & SQLite WAL Concurrency

The control plane stores data across three physically separated SQLite database files using `@libsql/client`:

1. `data/core.db`: ACID core entities, users, clients, billing, outbox, and audit logs.
2. `data/analytics.db`: Append-only raw visitor events, web vitals, hourly/daily aggregates.
3. `data/metrics.db`: Server time-series samples and domain uptime probe history.

### Concurrency Guarantees
- **WAL Mode**: All databases run with `PRAGMA journal_mode = WAL`, allowing concurrent readers without blocking writers.
- **In-Process Write Mutex Queue**: An asynchronous mutex serializes write transactions per database file within each Node process.
- **`BEGIN IMMEDIATE`**: All write transactions acquire an immediate write lock to prevent upgrade deadlocks.
- **Timeout Backstop**: `PRAGMA busy_timeout = 5000` allows OS-level cross-process coordination between `@rsl/portal` and `@rsl/worker`.

---

## 4. Transactional Outbox & Event-Driven Architecture

When an aggregate state changes (for example, a payment is recorded or a domain check fails), the domain event is committed to the `outbox` table in `core.db` in the **same atomic transaction** as the entity mutation:

```
[ Domain Operation ] ──► (BEGIN IMMEDIATE)
                             │
                             ├── Insert / Update Aggregate Row
                             └── Insert Outbox Event Record
                             │
                         (COMMIT)
                             │
                             ▼
              [ Background Worker Poller ]
                             │
             ┌───────────────┴───────────────┐
             │                               │
             ▼                               ▼
    Internal Subscribers             External Webhooks / SSE Hub
```

This guarantees **at-least-once delivery** of all domain events without distributed transaction locks.
