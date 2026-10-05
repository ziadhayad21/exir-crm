# El-Exir ERP — Tourism System & Unified Inbox

A production-grade CRM, Business Management System, and Unified Messaging Inbox for tourism companies, built with **Next.js 16**, **TypeScript**, **Supabase**, and **PostgreSQL**.

---

## 🚀 Status & Completed Phases

- **Phase 1 — Foundation & RBAC**: Infrastructure, authentication, fine-grained permission keys (`module.resource.action`), audit logging, and employee management.
- **Phase 2 — CRM Core**: Customers, Leads, Deals, Tourism Services, stage transitions, financial breakdowns, soft deletion, and activity tracking.
- **Phase 3 — Dynamic Lead Routing Engine**: Deterministic round-robin tie-breaker, daily lead counter, employee availability heartbeat, transaction advisory locks, and automated conversion to Customer/Deal.
- **Phase 4A — Unified Inbox Foundation**: Provider-agnostic message model, channel identities, conversation threads, raw webhook persistence, unassigned pending queue, and strict multi-role RLS isolation.
- **Phase 4B — Smart Backlog Batching**: Capacity-based backlog limits (`BACKLOG_BATCH_LIMIT = 5`), sticky assignments, automated queue drainage on employee online/heartbeat events, FIFO ordering, and overload protection.
- **Phase 4C.1 — Facebook Messenger Inbound Integration**: Production-grade Meta webhook verification challenge (`GET`), HMAC-SHA256 signature validation (`POST`), raw-first event persistence, atomic database RPC ingestion (`ingest_inbound_message`), thread-level advisory locks, and zero-lost/zero-duplicate lead concurrency safety.

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| **Next.js 16** | React framework with App Router & Server Actions |
| **TypeScript** | Strict end-to-end type safety |
| **Supabase** | Authentication, Database Engine, Storage & Realtime RLS |
| **PostgreSQL** | Database engine with PL/pgSQL RPCs & Advisory Locks |
| **Tailwind CSS v4** | UI Styling & Glassmorphism Aesthetics |
| **Zod** | Schema validation for forms, APIs, and webhooks |
| **Lucide React** | Icon library |

---

## ⚙️ Quick Start

### 1. Prerequisites

- Node.js 18+
- npm
- A Supabase PostgreSQL database (hosted or local)

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Variables

Copy `.env.local.example` to `.env.local`:

```bash
cp .env.local.example .env.local
```

Configure your environment variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Meta / Facebook Messenger Integration (Phase 4C.1)
META_VERIFY_TOKEN=your_meta_webhook_verify_token
META_APP_SECRET=your_meta_app_secret
META_PAGE_ACCESS_TOKEN=your_facebook_page_access_token
META_TEST_PAGE_ID=your_facebook_page_id
META_API_VERSION=v21.0
```

> ⚠️ **Security Warning**: `SUPABASE_SERVICE_ROLE_KEY` and `META_APP_SECRET` are strictly server-side credentials and must never be exposed to the client bundle.

### 4. Database Migrations

Run migrations sequentially from `supabase/migrations/` (000001 through 000028) via the Supabase Dashboard SQL Editor or using the Supabase CLI:

```bash
npx supabase db push
```

### 5. Seed Test Data

```bash
npx tsx scripts/seed.ts
```

This populates default roles, permissions, and test accounts:

| Email | Password | Role |
|---|---|---|
| `admin@elexir.test` | `Admin123!` | Admin |
| `sales@elexir.test` | `Sales123!` | Sales |
| `finance@elexir.test` | `Finance123!` | Accountant |
| `hr@elexir.test` | `Hr12345!` | HR |

### 6. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

---

## 📁 Project Architecture

```
src/
├── app/                        # Next.js App Router pages & API routes
│   ├── (dashboard)/            # Protected CRM dashboard pages
│   │   ├── admin/              # System admin & employee management
│   │   ├── crm/                # CRM Pages (Leads, Customers, Deals, Pipeline, Inbox)
│   │   │   └── inbox/          # Unified Messaging Inbox client UI
│   │   └── dashboard/          # Analytics & system overview
│   ├── api/
│   │   ├── heartbeat/          # Availability heartbeat ping API
│   │   └── webhooks/
│   │       └── inbound/        # Meta / Facebook Messenger Webhook endpoint (GET/POST)
│   ├── auth/callback/          # Authentication OAuth/session callback
│   ├── login/                  # Login interface
│   └── unauthorized/           # 403 Forbidden page
├── components/                 # Reusable UI & Layout components
├── lib/                        # Core system modules
│   ├── audit/                  # Audit logging service
│   ├── auth/                   # RBAC & Server-side auth utilities
│   ├── messaging/              # Meta payload adapter & signature verification
│   ├── supabase/               # Supabase SSR clients (browser, server, admin)
│   └── validations/            # Zod validation schemas
├── types/                      # TypeScript definitions & DB interfaces
└── middleware.ts               # Global Next.js middleware & route guards
```

---

## 🔒 Security & RBAC Architecture

1. **Permission Key Convention**: Dot-notation strings `module.resource.action` (e.g. `crm.leads.read_own`, `crm.inbox.read_assigned`, `admin.system`).
2. **Deny-by-Default RLS**: All PostgreSQL tables feature strict Row-Level Security policies enforced by `app.has_permission()` and `app.get_current_employee_id()`.
3. **Webhook Verification**: Meta POST webhooks validate `X-Hub-Signature-256` signatures against `META_APP_SECRET` using constant-time `crypto.timingSafeEqual` comparison.
4. **Audit System**: Critical operations (lead assignment, status changes, outbound messages, customer conversions) automatically record structured audit trails in `audit.audit_logs`.

---

## 🔄 Inbound Messaging & Lead Pipeline (Phase 4C.1)

```
Meta Webhook POST
  └─► Authenticate X-Hub-Signature-256
  └─► Store Raw Payload in app.webhook_events
  └─► Respond HTTP 200 OK
  └─► Ingest via app.ingest_inbound_message (PL/pgSQL RPC)
        ├─► Acquire Thread Advisory Lock (pg_advisory_xact_lock)
        ├─► Resolve/Create app.channel_identities
        ├─► Resolve/Create app.conversations thread
        ├─► Insert app.messages (ON CONFLICT IGNORE by external_message_id)
        ├─► Create/Link app.leads (with received_at timestamp)
        └─► Execute Phase 3/4B Routing Engine (app.assign_lead_to_sales)
              ├─► IF Online Sales Available & Active Backlog < 5: Assign immediately
              └─► ELSE: Queue as unassigned (status='new', pending_assignment)
```

---

## 📊 Database Migrations Overview

| Migration | Scope / Purpose |
|---|---|
| `000001` - `000008` | Schemas, Employees, RBAC tables, Audit logs, Auth functions, RLS policies, Base views |
| `000009` - `000012` | CRM Core: Customers, Services, Deals, and Deal Activities |
| `000013` - `000016` | CRM Permissions, RLS Policies, Views, and RPCs |
| `000017` - `000020` | Business model alignment, Deal statuses, Soft deletion support |
| `000021` | Leads table, Lead Assignment Engine (`app.assign_lead_to_sales`), Availability Heartbeats |
| `000022` - `000023` | Messaging Inbox Foundation: Webhook Events, Channel Identities, Conversations, Messages |
| `000024` - `000026` | Smart Backlog Batching (`BACKLOG_BATCH_LIMIT = 5`), Pending Queue Drainage, RLS Hardening |
| `000027` - `000028` | Meta Messenger Atomic Ingestion (`app.ingest_inbound_message`), Thread Locks, Contact Check fix |

---

## 🧪 Comprehensive QA & Verification Suites

The codebase includes automated end-to-end verification scripts covering all implemented phases:

| Command | Suite Description | Tests | Status |
|---|---|:---:|:---:|
| `npx tsx scripts/test_phase3_full.ts` | Phase 3 Lead Assignment & Fair Distribution | 69 | **PASS (100%)** |
| `npx tsx scripts/test_phase4a_qa_full.ts` | Phase 4A Inbox Foundation & Security | 70 | **PASS (100%)** |
| `npx tsx scripts/test_phase4b_deep_qa.ts` | Phase 4B Smart Backlog Batching & Limits | 10 | **PASS (100%)** |
| `npx tsx scripts/test_phase4c1_messenger.ts` | Phase 4C.1 Messenger & Concurrency Safety | 13 | **PASS (100%)** |
| `npm run type-check` | TypeScript Strict Type Checking | 1 | **PASS (0 errors)** |
| `npm run lint` | ESLint Code Quality Standards | 1 | **PASS (0 errors)** |
| `npm run build` | Next.js Production Build Validation | 1 | **PASS (0 errors)** |

---

## 📜 Available Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Build Next.js production bundle |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint static analysis |
| `npm run type-check` | Execute TypeScript compiler check (`tsc --noEmit`) |
| `npx tsx scripts/seed.ts` | Seed database with initial roles, permissions, and test employees |
