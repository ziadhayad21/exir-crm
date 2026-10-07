-- supabase/migrations/20240101000035_expand_lead_assignment_source_check.sql
-- Add 'transfer' to app.leads assignment_source check constraint

ALTER TABLE app.leads
  DROP CONSTRAINT IF EXISTS leads_assignment_source_check;

ALTER TABLE app.leads
  ADD CONSTRAINT leads_assignment_source_check
  CHECK (assignment_source IN ('automatic', 'manual', 'unassigned', 'transfer'));
