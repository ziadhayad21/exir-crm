-- supabase/migrations/20240101000018_crm_deal_statuses.sql
-- Phase 2: CRM UI Adjustment — Support 'follow_up' status in deals table

ALTER TABLE app.deals DROP CONSTRAINT IF EXISTS deals_stage_check;
ALTER TABLE app.deals ADD CONSTRAINT deals_stage_check
  CHECK (stage IN ('new', 'follow_up', 'won', 'lost', 'contacted', 'qualified', 'proposal', 'negotiation'));

COMMENT ON COLUMN app.deals.stage IS 'Deal status: new, follow_up, won, lost (with legacy pipeline stages permitted)';
