# El-Exir ERP — Tourism Company Management System

A production-grade CRM & Business Management System for tourism companies, built with Next.js, TypeScript, Supabase, and PostgreSQL.

## Phase 1 — Foundation / Infrastructure / Auth / RBAC

This is the Phase 1 implementation. It provides the foundational infrastructure that all future modules (CRM, Finance, HR, etc.) will depend on.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| **Next.js 16** | React framework with App Router |
| **TypeScript** | Strict type safety |
| **Supabase** | Auth, Database, Storage |
| **PostgreSQL** | Database (via Supabase) |
| **Tailwind CSS v4** | Styling |
| **Zod** | Input validation |
| **Lucide React** | Icons |

---

## Quick Start

### 1. Prerequisites

- Node.js 18+
- npm
- A Supabase project (hosted or local)

### 2. Clone & Install

```bash
npm install
```

### 3. Environment Variables

Copy the example env file:

```bash
cp .env.local.example .env.local
```

Fill in your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> ⚠️ **Never commit `.env.local` or expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.**

### 4. Run Database Migrations

**Option A: Supabase Dashboard (hosted)**
1. Go to your Supabase Dashboard → SQL Editor
2. Run each migration file from `supabase/migrations/` in order (000001 through 000008)

**Option B: Supabase CLI (local)**
```bash
npx supabase db push
```

### 5. Seed Test Data

```bash
npx tsx scripts/seed.ts
```

This creates 4 test users:

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

## Project Architecture

```
src/
├── app/                        # Next.js App Router pages
│   ├── (dashboard)/            # Protected pages (requires auth)
│   │   ├── admin/              # Admin module (requires admin.system)
│   │   │   ├── employees/      # Employee management
│   │   │   ├── roles/          # Role viewing
│   │   │   └── permissions/    # Permission viewing
│   │   └── dashboard/          # Main dashboard
│   ├── auth/callback/          # Supabase auth callback
│   ├── login/                  # Login page
│   └── unauthorized/           # Permission denied page
├── components/                 # Shared UI components
│   ├── sidebar.tsx             # Navigation sidebar
│   └── topbar.tsx              # Top bar with user menu
├── lib/                        # Core libraries
│   ├── auth/                   # Authentication & authorization
│   │   ├── index.ts            # Server-side auth helpers
│   │   └── client-helpers.ts   # Client-side permission checks
│   ├── audit/                  # Audit logging
│   ├── supabase/               # Supabase client configuration
│   │   ├── client.ts           # Browser client
│   │   ├── server.ts           # Server client (SSR)
│   │   ├── admin.ts            # Admin client (service role)
│   │   └── middleware.ts       # Session middleware
│   ├── validations/            # Zod schemas
│   └── utils.ts                # General utilities
├── types/                      # TypeScript types
│   ├── database.ts             # Database model types
│   └── index.ts                # Central exports
└── middleware.ts                # Route protection middleware
```

---

## Authentication Architecture

1. **Supabase Auth** handles email/password authentication
2. **Middleware** (`src/middleware.ts`) refreshes sessions on every request and redirects unauthenticated users
3. **Server-side checks** (`requireAuth()`, `requirePermission()`) enforce access in Server Components and Server Actions
4. **Supabase SSR** (`@supabase/ssr`) manages cookies for server-side rendering

### Flow:
```
Browser → Middleware (session refresh) → Server Component → requireAuth() → Render
                                                          → requirePermission() → Render or Redirect
```

---

## RBAC Architecture

### Permission Key System

Permissions use dot-notation keys: `module.resource.action`

Examples:
- `admin.system` — Full system access (superuser)
- `crm.leads.read_own` — Read own leads
- `finance.write` — Modify financial records

### Authorization Check Flow:

```
Client UI → hasPermission(user, 'key')           # Hide/show UI elements
Server     → requirePermission('key')            # Block access server-side
Database   → app.has_permission('key')            # RLS policy enforcement
```

### Never do this:
```typescript
// ❌ Bad — hardcoded role names
if (user.role === "admin") { ... }

// ✅ Good — permission keys
if (hasPermission(user, "admin.system")) { ... }
```

---

## Row Level Security (RLS)

All application tables have RLS enabled with deny-by-default:

| Table | Self-access | Admin access | Notes |
|---|---|---|---|
| `employees` | Own record only | All records | Via `auth_user_id = auth.uid()` |
| `roles` | Read all | Read all | Reference data |
| `permissions` | Read all | Read all | Reference data |
| `user_roles` | Own assignments | All assignments | |
| `audit_logs` | None | Read only | Writes via service_role only |

### Database Helper Functions:
- `app.get_current_employee_id()` — Returns current user's employee UUID
- `app.has_permission('key')` — Checks if current user has a permission
- `app.is_active_employee()` — Checks if current user is active

---

## Database Migrations

Migrations are in `supabase/migrations/` and numbered sequentially:

| Migration | Purpose |
|---|---|
| `000001` | Create `app` and `audit` schemas |
| `000002` | Create `employees` table |
| `000003` | Create RBAC tables (roles, permissions, user_roles, role_permissions) |
| `000004` | Create `audit_logs` table |
| `000005` | Create authorization functions |
| `000006` | Enable RLS policies on all tables |
| `000007` | Seed initial roles and permissions |
| `000008` | Create public views for Supabase API access |

---

## Security

- ✅ `SUPABASE_SERVICE_ROLE_KEY` is server-only (never in `NEXT_PUBLIC_*`)
- ✅ Input validated with Zod on all server actions
- ✅ RLS enabled on all tables — deny by default
- ✅ Server-side authorization on all protected routes
- ✅ Middleware-level route protection
- ✅ Audit logging for sensitive actions
- ✅ SECURITY DEFINER functions use fixed `search_path`

---

## Testing Phase 1

### Authentication
- [x] Login with email/password works
- [x] Logout works
- [x] Session persists across page refresh
- [x] Unauthenticated users redirect to `/login`
- [x] Authenticated users redirect from `/login` to `/dashboard`

### RBAC
- [x] Admin has `admin.system` permission
- [x] Sales does NOT have admin permissions
- [x] Non-admin users cannot access `/admin/*` routes
- [x] Permission checks work at server and database level

### Admin
- [x] View employees list
- [x] Create new employee (creates auth user + employee record)
- [x] Activate/deactivate employees
- [x] Assign roles to employees
- [x] View roles and permissions

### Security
- [x] Service role key never exposed in browser
- [x] Protected routes cannot be bypassed via URL
- [x] Server-side authorization enforced
- [x] RLS prevents unauthorized data access

---

## What Is NOT Implemented (Phase 2+)

The following are **intentionally** not built in Phase 1:

- CRM (Leads, Customers, Deals, Pipeline)
- Unified Inbox (WhatsApp, Instagram, Messenger)
- Finance (Payments, Expenses)
- HR (Attendance, Payroll, Salary)
- Follow-ups & Notifications
- Reports & Analytics
- AI
- Profile editing
- Advanced role management UI
- Complete audit log viewer UI

---

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |
| `npx tsx scripts/seed.ts` | Seed test data |
