-- supabase/migrations/20240101000016_crm_expose_rpcs.sql
-- Phase 2: CRM Core — Expose atomic CRM RPC functions to public schema for PostgREST
-- strictly restricted to service_role (Admin client) only.

-- 1. Expose crm_create_deal in public schema
CREATE OR REPLACE FUNCTION public.crm_create_deal(
  p_title TEXT,
  p_customer_id UUID,
  p_service_id UUID,
  p_assigned_to UUID,
  p_value NUMERIC,
  p_expected_close_date DATE,
  p_notes TEXT,
  p_created_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  RETURN app.crm_create_deal(
    p_title,
    p_customer_id,
    p_service_id,
    p_assigned_to,
    p_value,
    p_expected_close_date,
    p_notes,
    p_created_by
  );
END;
$$;

-- 2. Expose crm_change_deal_stage in public schema
CREATE OR REPLACE FUNCTION public.crm_change_deal_stage(
  p_deal_id UUID,
  p_new_stage TEXT,
  p_actor_id UUID,
  p_lost_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  PERFORM app.crm_change_deal_stage(
    p_deal_id,
    p_new_stage,
    p_actor_id,
    p_lost_reason
  );
END;
$$;

-- 3. Expose crm_reassign_deal in public schema
CREATE OR REPLACE FUNCTION public.crm_reassign_deal(
  p_deal_id UUID,
  p_new_assignee UUID,
  p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  PERFORM app.crm_reassign_deal(
    p_deal_id,
    p_new_assignee,
    p_actor_id
  );
END;
$$;

-- ─── Security: REVOKE FROM PUBLIC & authenticated, GRANT TO service_role ONLY ───

REVOKE ALL ON FUNCTION public.crm_create_deal(TEXT, UUID, UUID, UUID, NUMERIC, DATE, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_create_deal(TEXT, UUID, UUID, UUID, NUMERIC, DATE, TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.crm_change_deal_stage(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_change_deal_stage(UUID, TEXT, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.crm_reassign_deal(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_reassign_deal(UUID, UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.crm_create_deal IS 'Atomic deal + initial activity creation. Restricted to service_role.';
COMMENT ON FUNCTION public.crm_change_deal_stage IS 'Atomic stage change + timeline activity. Restricted to service_role.';
COMMENT ON FUNCTION public.crm_reassign_deal IS 'Atomic deal reassignment + timeline activity. Restricted to service_role.';
