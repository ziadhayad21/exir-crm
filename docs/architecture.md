# Architecture — El-Exir ERP

## Overview

El-Exir ERP is a modular business management system designed for tourism companies. The architecture is built to support incremental module additions without creating a monolithic codebase.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js Frontend                        │
│                                                                 │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │  Login   │  │  Dashboard   │  │   Admin Module          │  │
│  │  Page    │  │  Page        │  │  (Employees/Roles/Perms)│  │
│  └────┬─────┘  └──────┬───────┘  └───────────┬─────────────┘  │
│       │               │                      │                  │
│  ┌────┴───────────────┴──────────────────────┴──────────────┐  │
│  │              Middleware (Session Refresh)                  │  │
│  └────────────────────────┬──────────────────────────────────┘  │
│                           │                                     │
│  ┌────────────────────────┴──────────────────────────────────┐  │
│  │              Server-Side Auth Layer                        │  │
│  │  requireAuth() → requirePermission() → Server Actions     │  │
│  └────────────────────────┬──────────────────────────────────┘  │
│                           │                                     │
│  ┌────────────────────────┴──────────────────────────────────┐  │
│  │              Supabase Clients                              │  │
│  │  Browser Client │ Server Client │ Admin Client             │  │
│  └────────────────────────┬──────────────────────────────────┘  │
└───────────────────────────┼─────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                    Supabase Platform                             │
│                           │                                     │
│  ┌────────────────────────┴──────────────────────────────────┐  │
│  │              PostgREST API                                 │  │
│  └────────────────────────┬──────────────────────────────────┘  │
│                           │                                     │
│  ┌────────────────────────┴──────────────────────────────────┐  │
│  │              PostgreSQL Database                           │  │
│  │                                                            │  │
│  │  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐ │  │
│  │  │   app   │  │  audit   │  │   auth    │  │  public  │ │  │
│  │  │ schema  │  │  schema  │  │  schema   │  │  views   │ │  │
│  │  └────┬────┘  └────┬─────┘  └─────┬─────┘  └────┬─────┘ │  │
│  │       │            │              │              │        │  │
│  │  ┌────┴────────────┴──────────────┴──────────────┘        │  │
│  │  │              Row Level Security (RLS)                   │  │
│  │  │  + Authorization Functions                              │  │
│  │  └────────────────────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### app schema

| Table | Purpose |
|---|---|
| `employees` | Application-level user profiles linked to Supabase Auth |
| `roles` | System roles (Admin, Sales, Accountant, HR) |
| `permissions` | Granular permission keys grouped by module |
| `role_permissions` | Many-to-many: which permissions each role has |
| `user_roles` | Many-to-many: which roles each employee has |

### audit schema

| Table | Purpose |
|---|---|
| `audit_logs` | Append-only log of all system actions |

### Authorization Functions

| Function | Purpose |
|---|---|
| `app.get_current_employee_id()` | Gets employee UUID from JWT |
| `app.has_permission(key)` | Checks permission via role chain |
| `app.is_active_employee()` | Checks if the user is active |

---

## Authorization Layer (3 Tiers)

### Tier 1: Middleware (Edge)
The Next.js middleware runs on every request. It refreshes Supabase sessions and redirects unauthenticated users to `/login`.

### Tier 2: Server Components / Server Actions
Server-side functions (`requireAuth()`, `requirePermission()`) check the user's role and permissions before rendering pages or executing mutations.

### Tier 3: Database (RLS)
PostgreSQL Row Level Security policies enforce data access at the database level. Even if Tier 1 and 2 are somehow bypassed, the database will reject unauthorized access.

---

## Supabase Client Strategy

| Client | Used In | Auth Context | Bypasses RLS |
|---|---|---|---|
| **Browser Client** | Client Components | User's JWT | No |
| **Server Client** | Server Components, Actions | User's cookies | No |
| **Admin Client** | Server Actions only | Service Role Key | Yes |

> The Admin Client is used ONLY for operations that need to bypass RLS, such as:
> - Creating auth users
> - Writing audit logs
> - Admin operations on behalf of other users

---

## Modular Architecture for Future Phases

Each business module will be self-contained:

```
src/
├── app/
│   └── (dashboard)/
│       ├── crm/            # Phase 2: CRM module
│       ├── finance/        # Phase 3: Finance module
│       ├── hr/             # Phase 4: HR module
│       └── inbox/          # Phase 5: Unified Inbox
├── modules/                # Module-specific logic
│   ├── crm/
│   ├── finance/
│   └── hr/
```

Each module will:
1. Have its own routes under `app/(dashboard)/`
2. Have its own server actions
3. Have its own database tables and migrations
4. Use the shared RBAC system for authorization
5. Write to the shared audit log

---

## Key Design Decisions

1. **Permission keys over role names** — Authorization checks use permission keys (`admin.system`) instead of role names (`Admin`), making the system flexible and extensible.

2. **Three-tier authorization** — Middleware → Server → Database ensures defense in depth.

3. **Separate schemas** — Application data lives in `app.*` and audit data in `audit.*`, keeping the codebase organized.

4. **Service role for writes** — Audit logs and admin operations use the service role client, ensuring that regular users cannot tamper with audit data even if they find a vulnerability.

5. **No client-side trust** — All authorization is enforced server-side. Client-side permission checks only affect UI visibility, never actual access.
