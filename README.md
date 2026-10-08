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
  - Validation engine: Magic byte inspection, MIME-type verification, extension validation, and file size limits (Images: 10MB, Videos: 50MB, Audio: 25MB, Documents: 50MB).
  - Outbound media dispatch via signed URLs to Meta Graph API and WhatsApp Cloud API.
  - Inbound media parsing and signed URL preview resolution.
- **Unified Inbox Realtime & Zero-Latency Experience**:
  - **Instant 0ms Conversation Switching**: In-memory SWR message caching (`messagesCacheRef`) rendering cached messages instantly while revalidating in the background.
  - **Zero-Latency Optimistic UI**: Instant local message addition with client-side UUID generation (`crypto.randomUUID()`) matching database rows.
  - **In-Flight Message Protection**: Safe background synchronization engine that protects messages currently uploading/sending from premature eviction.
  - **Seamless Media Previews**: Local blob preview streaming preventing flicker or disappearance during storage upload.
  - **Non-Blocking Server Actions**: High-frequency replies bypass full-page RSC revalidation for sub-200ms API response times.
- **Lead Status Workflow & Follow-Up Engine**:
  - Authoritative lifecycle transitions (`new` ➔ `in_progress` ➔ `follow_up` ➔ `won` / `lose`) powered by PostgreSQL RPC (`change_lead_status`).
  - Cairo timezone-aware follow-up scheduling (`Africa/Cairo`) with live overdue, due, and upcoming badges.
  - Won deals financial tracking: Service package, Total Amount, Paid Amount, and auto-calculated Remaining Amount (`paid <= total`).
  - Topbar Notification Bell (`notification-bell.tsx`) with real-time due follow-up counters.
- **Customer ↔ Lead Bi-Directional Linking**:
  - Reusable `SearchableSelect` component with real-time multi-field search across Name, Phone, and ID.
  - When creating a Customer: link directly to an existing Lead without generating duplicate leads.
  - When creating a Lead: link directly to an existing Customer.
  - Customer uniqueness protection on manual form creation: blocks duplicate phone numbers and emails.
- **Excel (.xlsx / .csv) Import & Export Engine**:
  - **100% Local & Server-Side**: Powered by SheetJS (`xlsx`) without external services or data exposure.
  - **Role-Based Report Generation**: Sales export only their assigned records; Admins export all accessible data.
  - **Interactive Pre-Import Validation**: Validates spreadsheets before database writes, displaying New (`create`), Update (`update`), Skipped (`skip`), and Error rows in an interactive preview modal.
  - **Arbitrary ID Normalization (`normalizeToUuid`)**: Supports any ID style (numeric `1, 2, 100`, text `LD-01, CUST-05`, or standard UUIDs) mapped deterministically to PostgreSQL RFC-4122 UUIDs.
  - **Strict ID-Based Deduplication**: Matches existing records solely by ID to update them in-place, while allowing repeated or constant contact details (phone, email, notes). Duplicate IDs in the same file are safely skipped.
  - **Sample Template Downloads**: Built-in `.xlsx` template generator for easy data formatting.

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| **Next.js 16** | React framework with App Router, Server Actions & Streaming (Turbopack) |
| **React 19** | Modern UI components with Hooks, Transitions & Optimistic State |
| **TypeScript** | Strict end-to-end type safety |
| **Supabase** | Authentication, PostgreSQL Database, Storage & Realtime Subscriptions |
| **PostgreSQL** | Database engine with PL/pgSQL RPCs, Partial Indexes & Advisory Locks |
| **SheetJS (xlsx)** | Local, zero-dependency Excel file generation and parsing |
| **Tailwind CSS v4** | Modern responsive styling & Glassmorphism design tokens |
| **Zod** | Schema validation for forms, APIs, server actions, and webhooks |
| **Lucide React** | Modern iconography |

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

> ⚠️ **Security Warning**: `SUPABASE_SERVICE_ROLE_KEY`, `META_APP_SECRET`, and access tokens are strictly server-side credentials and must never be exposed to client bundles.

### 4. Database Migrations

Apply database migrations sequentially from `supabase/migrations/` (`000001` through `000044`) via the Supabase Dashboard SQL Editor or the Supabase CLI:

```bash
npx supabase db push
```

### 5. Seed Test Data

Populate default roles, permissions, tourism services, and test employee accounts:

```bash
npm run seed
# or
npx tsx scripts/seed_clean_accounts.ts
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
│   │   │   ├── customers/      # Customer directory, details & Excel Import/Export
│   │   │   ├── deals/          # Deal pipeline & Kanban stages
│   │   │   ├── leads/          # Leads pipeline, status workflow & Excel Import/Export
│   │   │   ├── services/       # Tourism services catalogue
│   │   │   ├── inbox/          # Omnichannel Unified Messaging Inbox UI
│   │   │   ├── actions.ts      # Customer server actions & uniqueness checks
│   │   │   ├── excel-actions.ts# Excel Export/Import parsing, preview & execution
│   │   │   ├── inbox-actions.ts# Real-time messaging server actions
│   │   │   └── lead-actions.ts # Lead lifecycle transitions & search actions
│   │   ├── notification-actions.ts # Follow-up alerts & notification badges
│   │   └── dashboard/          # Analytics overview & KPIs
│   ├── api/
│   │   ├── heartbeat/          # Availability heartbeat ping endpoint
│   │   └── webhooks/
│   │       └── inbound/        # Multi-channel webhook ingestion (Meta, WhatsApp, IG)
│   ├── auth/callback/          # Supabase auth session callback
│   ├── login/                  # Authentication interface
│   └── unauthorized/           # 403 Forbidden access boundary
├── components/                 # Reusable UI widgets & layout navigation
│   ├── excel-import-modal.tsx  # Interactive Excel drag-and-drop & preview modal
│   ├── notification-bell.tsx   # Due follow-ups alert bell in topbar
│   ├── searchable-select.tsx   # Multi-field searchable dropdown component
│   └── topbar.tsx              # Application header & user menu
├── lib/                        # Core system services
│   ├── audit/                  # Audit trail logger (audit.audit_logs)
│   ├── auth/                   # RBAC helpers, permissions & session guards
│   ├── excel/                  # SheetJS base64 builder, parser & normalizeToUuid
│   ├── messaging/              # Meta adapter, signature verification, media manager
│   ├── supabase/               # Supabase SSR clients (client, server, admin)
│   └── validations/            # Zod validation schemas
├── types/                      # TypeScript database interfaces & entity definitions
└── middleware.ts               # Global route protection & auth session refresh
```

---

## 📊 Excel Import/Export Engine & Deduplication

The CRM features a dedicated, local-only Excel import/export engine designed for high data integrity:

### 1. Generate Report (Export)
- Available in both **Leads** and **Customers** modules.
- Generates a styled `.xlsx` workbook containing all authorized records.
- Preserves primary record UUIDs in the `ID` column, enabling safe round-trip editing and re-importing.
- Enforces strict RLS: Sales reps can only export their assigned data, while Admins export all active data.

### 2. Import Report & Pre-Import Preview
- Accepts `.xlsx`, `.xls`, and `.csv` spreadsheets via file selector or drag & drop.
- Features a **Download sample Excel template** link for instant formatting reference.
- **Two-Step Safe Workflow**:
  1. **Validation & Preview**: Evaluates the entire file without writing to the database. Displays summary counts:
     - **New**: Records with new or unassigned IDs ready for creation.
     - **Updates**: Records matching existing database IDs ready for in-place modification.
     - **Skipped**: Duplicate IDs repeated within the same file (first occurrence processed, subsequent skipped).
     - **Errors**: Invalid data (missing name, missing contact method, invalid follow-up date, or unauthorized records).
  2. **Execution**: Requires explicit user confirmation. Executes atomic bulk inserts/updates with full audit log tracking.

### 3. Arbitrary ID Normalization (`normalizeToUuid`)
- PostgreSQL requires UUID primary keys, but users often use custom or numeric IDs in spreadsheets (`1`, `2`, `LD-01`, `CUST-10`).
- The `normalizeToUuid` helper deterministically maps any arbitrary string or number into a standard RFC-4122 UUID:
  - If already a valid UUID: preserved exactly.
  - If a number or text (e.g. `'1'`, `'LD-01'`): deterministically hashed using MD5 so that ID `'1'` always resolves to the exact same UUID every time.
  - If empty or omitted: a fresh `crypto.randomUUID()` is generated.
- **Deduplication Rule**: Matching is performed **strictly by ID**. Repeated or static contact information (phone, email, notes) across multiple records is fully supported without unwanted skipping.

---

## 🔒 Security & RBAC Architecture

1. **Permission Key Convention**: Structured dot-notation strings `module.resource.action` (e.g. `crm.leads.read_own`, `crm.leads.write`, `crm.customers.read_all`, `crm.inbox.write`).
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
        └─► Execute Routing Engine (app.assign_lead_to_sales)
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

| Migration Range | Scope / Purpose |
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
| `000031` - `000035` | Performance indexes, RLS optimizations, offline transferable leads, and expanded assignment sources |
| `000036` - `000040` | Lead status workflow engine (`change_lead_status` RPC), Cairo follow-ups, role transition checks |
| `000041` - `000044` | Customer ↔ Lead relationship alignment (`customer_id`), won/lost service fields, omnichannel sources |

---

## 🧪 Verification & Testing Suites

Automated verification scripts covering every layer of the architecture:

| Command | Suite Description |
|---|---|
| `npx tsx scripts/verify_id_dedup_import.ts` | Arbitrary ID normalization, deterministic UUIDs & duplicate suppression |
| `npx tsx scripts/verify_excel_import_export.ts` | Excel roundtrip build/parse, RLS isolation & constraint verification |
| `npx tsx scripts/verify_customer_lead_linking.ts` | Customer ↔ Lead bi-directional linking & search integrity |
| `npx tsx scripts/verify_customer_uniqueness.ts` | Customer form phone & email uniqueness enforcement |
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
| `npx tsx scripts/seed_clean_accounts.ts` | Seed database with initial roles, permissions, services, and employee accounts |
| `npx tsx scripts/seed_20_leads.ts` | Seed 20 realistic Egyptian tourism leads for pipeline demonstration |
| `npx tsx scripts/wipe_data.ts` | Reset test operational data (messages, leads, customers) while preserving staff accounts |
| `npm run type-check` | Run static type checking without emitting files |
| `npm run build` | Compile and bundle production application |
| `npm run dev` | Launch local development server |
