# El-Exir ERP — Tourism CRM & Omnichannel Unified Inbox

A production-grade CRM, Tourism Business Management System, and Realtime Omnichannel Messaging Inbox built with **Next.js 16**, **React 19**, **TypeScript**, **Supabase**, and **PostgreSQL**.

---

## 🚀 Status & Completed Phases

- **Phase 1 — Foundation & RBAC**: Infrastructure, authentication, fine-grained permission keys (`module.resource.action`), structured audit logging (`audit.audit_logs`), and employee management.
- **Phase 2 — CRM Core**: Customers, Leads, Deals, Tourism Services, stage transitions, financial breakdowns, soft deletion, and activity timeline tracking.
- **Phase 3 — Dynamic Lead Routing Engine**: Deterministic round-robin tie-breaker, daily lead counter, employee availability heartbeat, transaction advisory locks, and automated conversion to Customer/Deal.
- **Phase 4A — Unified Inbox Foundation**: Provider-agnostic message model, channel identities, conversation threads, raw webhook persistence, unassigned pending queue, and strict multi-role RLS isolation.
- **Phase 4B — Smart Backlog Batching**: Capacity-based backlog limits (`BACKLOG_BATCH_LIMIT = 5`), sticky assignments, automated queue drainage on employee online/heartbeat events, FIFO ordering, and overload protection.
- **Phase 4C.1 — Facebook Messenger Inbound Integration**: Production-grade Meta webhook verification challenge (`GET`), HMAC-SHA256 signature validation (`POST`), raw-first event persistence, atomic database RPC ingestion (`ingest_inbound_message`), thread-level advisory locks, and zero-lost/zero-duplicate lead concurrency safety.
- **Phase 4C.2 — Instagram Direct Messaging Integration**: Inbound Instagram messaging webhooks, profile resolution (`fetchInstagramProfile`), and unified conversation threads.
- **Phase 4C.3 — WhatsApp Cloud API Inbound Integration**: WhatsApp Cloud API webhook ingestion, phone identity mapping, contact phone validation, and real-time thread creation.
- **Phase 4D — Multi-Channel Outbound Messaging Engine**: Outbound reply dispatching across WhatsApp, Facebook Messenger, and Instagram, 24-hour WhatsApp customer service window compliance, and delivery status tracking (`sending` ➔ `sent` ➔ `delivered` ➔ `read` ➔ `failed`).
- **Phase 4E — Media & Attachment Messaging Engine**:
  - Secure private Supabase Storage bucket (`message-attachments`).
  - Validation engine: Magic byte inspection, mime-type verification, extension validation, and file size limits (Images: 10MB, Videos: 50MB, Audio: 25MB, Documents: 50MB).
  - Outbound media dispatch via signed URLs to Meta Graph API and WhatsApp Cloud API.
  - Inbound media parsing and signed URL preview resolution.
- **Unified Inbox Realtime & Zero-Latency Experience**:
  - **Instant 0ms Conversation Switching**: In-memory SWR message caching (`messagesCacheRef`) rendering cached messages instantly while revalidating in the background.
  - **Zero-Latency Optimistic UI**: Instant local message addition with client-side UUID generation (`crypto.randomUUID()`) matching database rows.
  - **In-Flight Message Protection**: Safe background synchronization engine that protects messages currently uploading/sending from premature eviction.
  - **Seamless Media Previews**: Local blob preview streaming preventing flicker or disappearance during storage upload.
  - **Non-Blocking Server Actions**: High-frequency replies bypass full-page RSC revalidation for sub-200ms API response times.

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| **Next.js 16** | React framework with App Router, Server Actions & Streaming |
| **React 19** | Modern UI components with Hooks & Optimistic State |
| **TypeScript** | Strict end-to-end type safety |
| **Supabase** | Authentication, Database Engine, Storage & Realtime RLS |
| **PostgreSQL** | Database engine with PL/pgSQL RPCs & Advisory Locks |
| **Tailwind CSS v4** | Modern responsive styling & Glassmorphism aesthetics |
| **Zod** | Schema validation for forms, APIs, server actions, and webhooks |
| **Lucide React** | Production iconography |

---

## ⚙️ Quick Start

### 1. Prerequisites

- **Node.js**: v18+ (v20+ recommended)
- **npm**: v9+
- A **Supabase** PostgreSQL instance (hosted or local CLI)

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

# Instagram Messaging Integration (Phase 4C.2)
INSTAGRAM_ACCESS_TOKEN=your_instagram_page_or_user_access_token
INSTAGRAM_VERIFY_TOKEN=your_instagram_webhook_verify_token
INSTAGRAM_APP_SECRET=your_instagram_app_secret

# WhatsApp Cloud API Integration (Phase 4C.3 & 4D)
WHATSAPP_PHONE_NUMBER_ID=your_whatsapp_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_whatsapp_system_user_token
WHATSAPP_VERIFY_TOKEN=your_whatsapp_webhook_verify_token
WHATSAPP_BUSINESS_ACCOUNT_ID=your_whatsapp_waba_id
```

> ⚠️ **Security Warning**: `SUPABASE_SERVICE_ROLE_KEY`, `META_APP_SECRET`, and access tokens are strictly server-side credentials and must never be exposed to the client bundle.

### 4. Database Migrations

Apply database migrations sequentially from `supabase/migrations/` (`000001` through `000030`) via the Supabase Dashboard SQL Editor or the Supabase CLI:

```bash
npx supabase db push
```

### 5. Seed Test Data

Populate default roles, permissions, tourism services, and test employee accounts:

```bash
npm run seed
# or
npx tsx scripts/seed.ts
```

#### Pre-configured Test Accounts:

| Email | Password | Role | Description |
|---|---|---|---|
| `admin@elexir.test` | `Admin123!` | Admin | Full system access, all permissions |
| `sales@elexir.test` | `Sales123!` | Sales | Lead pipeline, assigned inbox conversations |
| `finance@elexir.test` | `Finance123!` | Accountant | Deals, transactions, accounting |
| `hr@elexir.test` | `Hr12345!` | HR | Employees, attendance, payroll |

### 6. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

---

## 📁 Project Architecture

```
src/
├── app/                        # Next.js App Router pages & API endpoints
│   ├── (dashboard)/            # Protected dashboard layout & views
│   │   ├── admin/              # System admin & employee management
│   │   ├── crm/                # CRM core modules
│   │   │   ├── customers/      # Customer directory & details
│   │   │   ├── deals/          # Deal pipeline & Kanban stages
│   │   │   ├── leads/          # Inbound leads & conversion
│   │   │   ├── services/       # Tourism services catalogue
│   │   │   └── inbox/          # Omnichannel Unified Messaging Inbox UI
│   │   └── dashboard/          # Analytics overview & KPIs
│   ├── api/
│   │   ├── heartbeat/          # Availability heartbeat ping endpoint
│   │   └── webhooks/
│   │       └── inbound/        # Multi-channel webhook ingestion (Meta, WhatsApp, IG)
│   ├── auth/callback/          # Supabase auth session callback
│   ├── login/                  # Authentication interface
│   └── unauthorized/           # 403 Forbidden access boundary
├── components/                 # Reusable UI widgets & layout navigation
├── lib/                        # Core system services
│   ├── audit/                  # Audit trail logger (audit.audit_logs)
│   ├── auth/                   # RBAC helpers, permissions & session guards
│   ├── messaging/              # Meta adapter, signature verification, media manager
│   ├── supabase/               # Supabase SSR clients (client, server, admin)
│   └── validations/            # Zod validation schemas
├── types/                      # TypeScript database interfaces & entity definitions
└── middleware.ts               # Global route protection & auth session refresh
```

---

## 🔒 Security & RBAC Architecture

1. **Permission Key Convention**: Structured dot-notation strings `module.resource.action` (e.g. `crm.leads.read_own`, `crm.inbox.write`, `admin.system`).
2. **Deny-by-Default RLS**: PostgreSQL Row-Level Security on all business tables enforced via `app.has_permission()` and `app.get_current_employee_id()`.
3. **Webhook HMAC Validation**: Webhook POST endpoints verify `X-Hub-Signature-256` signatures against app secrets using constant-time `crypto.timingSafeEqual` comparison.
4. **Media Security & Magic Bytes**: All uploaded media files undergo strict magic byte validation, file size enforcement, and storage path sanitization against directory traversal.
5. **Private Storage Isolation**: Uploaded attachments are stored in private Supabase Storage buckets, accessible solely via short-lived signed URLs generated on-demand.
6. **WhatsApp 24-Hour Service Window**: Free-form outbound messages enforce Meta's 24-hour customer service window restriction to prevent policy violations.

---

## 🔄 Messaging Pipelines

### Inbound Ingestion Pipeline

```
Inbound Webhook (WhatsApp / Messenger / Instagram)
  └─► Validate HMAC-SHA256 Signature (X-Hub-Signature-256)
  └─► Persist Raw Payload in app.webhook_events
  └─► Respond HTTP 200 OK immediately
  └─► Process via app.ingest_inbound_message (PL/pgSQL RPC)
        ├─► Acquire Thread Advisory Lock (pg_advisory_xact_lock)
        ├─► Resolve / Upsert app.channel_identities
        ├─► Resolve / Upsert app.conversations Thread
        ├─► Insert app.messages (ON CONFLICT IGNORE by external_message_id)
        ├─► Link/Create app.leads with Channel Metadata
        └─► Execute Phase 3/4B Routing Engine (app.assign_lead_to_sales)
              ├─► IF Online Sales Rep Available & Active Backlog < 5: Assign immediately
              └─► ELSE: Enqueue as unassigned (pending_assignment)
```

### Outbound Reply & Media Pipeline

```
Client Outbound Dispatch
  ├─► Render Instant Optimistic Bubble (0ms, client-side UUID, local blob preview)
  ├─► Upload Media to Private Storage Bucket (if attachment present)
  ├─► Generate 1-Hour Time-Limited Signed URL
  ├─► Call Meta Graph / WhatsApp Cloud API
  ├─► Update Database Row status='sent' with external_message_id
  └─► Broadcast via Supabase Realtime to all connected CRM clients
```

---

## 🗄️ Database Migrations History

| Migration | Scope / Purpose |
|---|---|
| `000001` - `000008` | Base schemas (`app`, `audit`), Employees, RBAC tables, Audit logs, Auth functions, RLS policies |
| `000009` - `000012` | CRM Core: Customers, Tourism Services, Deals, and Deal Activity timeline |
| `000013` - `000016` | CRM Permissions, RLS Policies, Public Views, and PL/pgSQL RPC functions |
| `000017` - `000020` | Business model alignment, Deal statuses, and Soft deletion support |
| `000021` | Leads table, Lead Assignment Engine (`app.assign_lead_to_sales`), Availability Heartbeats |
| `000022` - `000023` | Omnichannel Messaging Foundation: Webhook Events, Channel Identities, Conversations, Messages |
| `000024` - `000026` | Smart Backlog Batching (`BACKLOG_BATCH_LIMIT = 5`), Pending Queue Drainage, RLS Hardening |
| `000027` - `000028` | Meta Messenger Atomic Ingestion (`app.ingest_inbound_message`), Thread Advisory Locks |
| `000029` | Supabase Realtime publication enablement for `messages`, `conversations`, and `channel_identities` |
| `000030` | Media Attachments table (`app.message_attachments`), Storage metadata, and private bucket policies |

---

## 🧪 Verification & Testing Suites

The repository contains automated verification scripts covering every layer of the architecture:

| Command | Suite Description |
|---|---|
| `npx tsx scripts/test_phase4c1_messenger.ts` | Facebook Messenger Inbound & Webhook Signature Tests |
| `npx tsx scripts/test_phase4c2_instagram.ts` | Instagram Inbound & Profile Resolution Tests |
| `npx tsx scripts/test_phase4c3_whatsapp.ts` | WhatsApp Cloud API Inbound Tests |
| `npx tsx scripts/test_phase4d_whatsapp_outbound.ts` | Outbound WhatsApp Replies & 24h Window Tests |
| `npx tsx scripts/test_phase4e_media.ts` | Media Uploads, Magic Bytes & Storage Security Tests |
| `npx tsx scripts/test_inbox_instant_switching.ts` | 0ms Inbox Conversation Switching & SWR Cache Tests |
| `npx tsx scripts/run_e2e_qa_suite.ts` | Comprehensive End-to-End System QA Suite |
| `npm run type-check` | TypeScript Strict Compiler Check (`tsc --noEmit`) |
| `npm run lint` | ESLint Code Quality Rules |
| `npm run build` | Next.js Production Build Validation |

---

## 🛠️ Maintenance & Utility Scripts

| Script | Purpose |
|---|---|
| `npx tsx scripts/seed.ts` | Seed database with initial roles, permissions, services, and employee accounts |
| `npx tsx scripts/wipe_data.ts` | Reset test operational data (messages, leads, customers) while preserving staff accounts |
| `npm run type-check` | Run static type checking without emitting files |
| `npm run build` | Compile and bundle production application |
| `npm run dev` | Launch local development server |
