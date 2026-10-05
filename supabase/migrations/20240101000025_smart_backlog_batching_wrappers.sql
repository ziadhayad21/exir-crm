-- supabase/migrations/20240101000025_smart_backlog_batching_wrappers.sql
-- Phase 4B: Public Schema Function Wrappers for Smart Backlog Batching

DROP FUNCTION IF EXISTS public.assign_lead_to_sales(UUID, TEXT);
DROP FUNCTION IF EXISTS public.assign_lead_to_sales(UUID, TEXT, INT);

CREATE OR REPLACE FUNCTION public.assign_lead_to_sales(
  p_lead_id UUID,
  p_business_tz TEXT DEFAULT 'Africa/Cairo',
  p_batch_limit INT DEFAULT 5
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  RETURN app.assign_lead_to_sales(p_lead_id, p_business_tz, p_batch_limit);
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_lead_to_sales(UUID, TEXT, INT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.assign_lead_to_sales(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.process_pending_unassigned_leads(TEXT);
DROP FUNCTION IF EXISTS public.process_pending_unassigned_leads(TEXT, INT);

CREATE OR REPLACE FUNCTION public.process_pending_unassigned_leads(
  p_business_tz TEXT DEFAULT 'Africa/Cairo',
  p_batch_limit INT DEFAULT 5
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  RETURN app.process_pending_unassigned_leads(p_business_tz, p_batch_limit);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_pending_unassigned_leads(TEXT, INT) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.process_pending_unassigned_leads(TEXT, INT) FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
