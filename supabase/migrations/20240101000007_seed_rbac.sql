-- supabase/migrations/20240101000007_seed_rbac.sql
-- Phase 1: Seed initial roles and permissions
-- These are the foundational RBAC records.

-- ─── Initial Roles ──────────────────────────────────────────────

INSERT INTO app.roles (id, name, description) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Admin',      'Full system access. Can manage employees, roles, and all system settings.'),
  ('a0000000-0000-0000-0000-000000000002', 'Sales',      'Access to future CRM functionality. Can manage leads, customers, and deals.'),
  ('a0000000-0000-0000-0000-000000000003', 'Accountant', 'Access to future Finance functionality. Can manage payments and expenses.'),
  ('a0000000-0000-0000-0000-000000000004', 'HR',         'Access to future HR functionality. Can manage attendance, payroll, and employee records.')
ON CONFLICT (name) DO NOTHING;

-- ─── Foundational Permissions ───────────────────────────────────
-- Only permissions needed for Phase 1 testing.
-- Future phase-specific permissions (crm.leads.*, finance.*, hr.*) will be added later.

INSERT INTO app.permissions (id, key, description, module) VALUES
  -- Admin permissions
  ('b0000000-0000-0000-0000-000000000001', 'admin.system',          'Full system administration access',     'admin'),
  ('b0000000-0000-0000-0000-000000000002', 'admin.employees.read',  'View all employees',                    'admin'),
  ('b0000000-0000-0000-0000-000000000003', 'admin.employees.write', 'Create and modify employees',           'admin'),
  ('b0000000-0000-0000-0000-000000000004', 'admin.roles.read',      'View roles and permissions',            'admin'),
  ('b0000000-0000-0000-0000-000000000005', 'admin.roles.write',     'Modify role assignments',               'admin'),
  ('b0000000-0000-0000-0000-000000000006', 'admin.audit.read',      'View audit logs',                       'admin'),

  -- Placeholder permissions for future modules (for testing RBAC structure)
  ('b0000000-0000-0000-0000-000000000010', 'crm.leads.read_own',    'View own leads',                        'crm'),
  ('b0000000-0000-0000-0000-000000000011', 'crm.leads.read_all',    'View all leads',                        'crm'),
  ('b0000000-0000-0000-0000-000000000012', 'crm.leads.write',       'Create and modify leads',               'crm'),
  ('b0000000-0000-0000-0000-000000000020', 'finance.read',          'View financial data',                   'finance'),
  ('b0000000-0000-0000-0000-000000000021', 'finance.write',         'Create and modify financial records',   'finance'),
  ('b0000000-0000-0000-0000-000000000030', 'hr.read',               'View HR data',                          'hr'),
  ('b0000000-0000-0000-0000-000000000031', 'hr.write',              'Modify HR records',                     'hr')
ON CONFLICT (key) DO NOTHING;

-- ─── Role ↔ Permission Assignments ─────────────────────────────

-- Admin gets admin.system (which grants access to everything)
INSERT INTO app.role_permissions (role_id, permission_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000006')
ON CONFLICT DO NOTHING;

-- Sales gets CRM permissions
INSERT INTO app.role_permissions (role_id, permission_id) VALUES
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000010'),
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000011'),
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000012')
ON CONFLICT DO NOTHING;

-- Accountant gets Finance permissions
INSERT INTO app.role_permissions (role_id, permission_id) VALUES
  ('a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000020'),
  ('a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000021')
ON CONFLICT DO NOTHING;

-- HR gets HR permissions
INSERT INTO app.role_permissions (role_id, permission_id) VALUES
  ('a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000030'),
  ('a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000031')
ON CONFLICT DO NOTHING;
