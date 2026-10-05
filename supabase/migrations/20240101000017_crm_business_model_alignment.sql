-- supabase/migrations/20240101000017_crm_business_model_alignment.sql
-- Phase 2: CRM Core — Alignment with Actual Tourism Business Workflow
-- 1. Decouple Deals from services/products catalog (no predefined service requirement).
-- 2. Add financial tracking columns to Deals: total_amount, paid_amount, remaining_amount, payment_method.
-- 3. Enforce remaining_amount = total_amount - paid_amount and paid_amount <= total_amount.
-- 4. Update atomic CRM RPCs (create_deal, change_deal_stage, update_deal_payment).
-- 5. Expose RPCs and views to public schema for service_role.

-- ─── 1. Modify app.deals Table ───────────────────────────────────

-- Add financial columns
ALTER TABLE app.deals
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) CHECK (total_amount IS NULL OR total_amount >= 0),
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) DEFAULT 0 CHECK (paid_amount IS NULL OR paid_amount >= 0),
  ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(12,2) CHECK (remaining_amount IS NULL OR remaining_amount >= 0),
  ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (
    payment_method IS NULL OR payment_method IN ('cash', 'bank_transfer', 'credit_card', 'vodafone_cash', 'instapay', 'other')
  );

-- Backfill total_amount from existing value column
UPDATE app.deals
SET total_amount = value
WHERE total_amount IS NULL AND value IS NOT NULL;

-- Backfill paid_amount (default to 0 if null)
UPDATE app.deals
SET paid_amount = 0
WHERE paid_amount IS NULL;

-- Backfill remaining_amount = total_amount - paid_amount
UPDATE app.deals
SET remaining_amount = GREATEST(0, COALESCE(total_amount, 0) - COALESCE(paid_amount, 0))
WHERE remaining_amount IS NULL AND total_amount IS NOT NULL;

-- Add database-level constraint: paid_amount must not exceed total_amount
ALTER TABLE app.deals
  DROP CONSTRAINT IF EXISTS deals_paid_le_total;

ALTER TABLE app.deals
  ADD CONSTRAINT deals_paid_le_total
  CHECK (total_amount IS NULL OR paid_amount IS NULL OR paid_amount <= total_amount);

-- Decouple deals from services catalog
ALTER TABLE app.deals
  DROP CONSTRAINT IF EXISTS deals_service_id_fkey;

-- ─── 2. Update Atomic RPC: app.crm_create_deal ───────────────────

DROP FUNCTION IF EXISTS public.crm_create_deal(TEXT, UUID, UUID, UUID, NUMERIC, DATE, TEXT, UUID);
DROP FUNCTION IF EXISTS app.crm_create_deal(TEXT, UUID, UUID, UUID, NUMERIC, DATE, TEXT, UUID);

CREATE OR REPLACE FUNCTION app.crm_create_deal(
  p_title TEXT,
  p_customer_id UUID,
  p_assigned_to UUID,
  p_total_amount NUMERIC DEFAULT NULL,
  p_expected_close_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_deal_id UUID;
  v_remaining NUMERIC(12,2);
BEGIN
  IF p_total_amount IS NOT NULL AND p_total_amount < 0 THEN
    RAISE EXCEPTION 'Total amount cannot be negative';
  END IF;

  v_remaining := p_total_amount;

  INSERT INTO app.deals (
    title, customer_id, assigned_to, stage,
    total_amount, value, currency, paid_amount, remaining_amount,
    expected_close_date, notes, created_by
  ) VALUES (
    p_title, p_customer_id, p_assigned_to, 'new',
    p_total_amount, p_total_amount, 'EGP', 0, v_remaining,
    p_expected_close_date, p_notes, p_created_by
  )
  RETURNING id INTO v_deal_id;

  INSERT INTO app.deal_activities (deal_id, actor_id, type, content)
  VALUES (v_deal_id, p_created_by, 'system', 'Deal created');

  RETURN v_deal_id;
END;
$$;

-- ─── 3. Update Atomic RPC: app.crm_change_deal_stage ─────────────

DROP FUNCTION IF EXISTS public.crm_change_deal_stage(UUID, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS app.crm_change_deal_stage(UUID, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.crm_change_deal_stage(UUID, TEXT, UUID, TEXT, NUMERIC, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS app.crm_change_deal_stage(UUID, TEXT, UUID, TEXT, NUMERIC, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION app.crm_change_deal_stage(
  p_deal_id UUID,
  p_new_stage TEXT,
  p_actor_id UUID,
  p_lost_reason TEXT DEFAULT NULL,
  p_total_amount NUMERIC DEFAULT NULL,
  p_paid_amount NUMERIC DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_old_stage TEXT;
  v_remaining NUMERIC(12,2);
  v_content TEXT;
  v_meta JSONB;
BEGIN
  -- Read current stage internally and lock row
  SELECT stage INTO v_old_stage
  FROM app.deals
  WHERE id = p_deal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal not found: %', p_deal_id;
  END IF;

  -- Validate lost requirements
  IF p_new_stage = 'lost' THEN
    IF p_lost_reason IS NULL OR char_length(trim(p_lost_reason)) = 0 THEN
      RAISE EXCEPTION 'Lost reason is required when deal is lost';
    END IF;
  END IF;

  -- Validate won financial requirements
  IF p_new_stage = 'won' THEN
    IF p_total_amount IS NULL OR p_total_amount < 0 THEN
      RAISE EXCEPTION 'Total amount is required and must be >= 0 when deal is won';
    END IF;
    IF p_paid_amount IS NULL OR p_paid_amount < 0 THEN
      RAISE EXCEPTION 'Paid amount is required and must be >= 0 when deal is won';
    END IF;
    IF p_paid_amount > p_total_amount THEN
      RAISE EXCEPTION 'Paid amount (%) cannot exceed total amount (%)', p_paid_amount, p_total_amount;
    END IF;

    -- System automatically calculates remaining amount
    v_remaining := p_total_amount - p_paid_amount;
  END IF;

  -- Apply updates based on stage
  IF p_new_stage = 'won' THEN
    UPDATE app.deals
    SET stage = 'won',
        lost_reason = NULL,
        total_amount = p_total_amount,
        value = p_total_amount,
        paid_amount = p_paid_amount,
        remaining_amount = v_remaining,
        payment_method = p_payment_method,
        updated_at = now()
    WHERE id = p_deal_id;

    v_content := 'Deal marked as Won. Total: ' || p_total_amount || ' EGP, Paid: ' || p_paid_amount || ' EGP, Remaining: ' || v_remaining || ' EGP' ||
                 CASE WHEN p_payment_method IS NOT NULL THEN ', Payment: ' || p_payment_method ELSE '' END;
    v_meta := jsonb_build_object(
      'old_stage', v_old_stage,
      'new_stage', 'won',
      'total_amount', p_total_amount,
      'paid_amount', p_paid_amount,
      'remaining_amount', v_remaining,
      'payment_method', p_payment_method
    );

  ELSIF p_new_stage = 'lost' THEN
    UPDATE app.deals
    SET stage = 'lost',
        lost_reason = p_lost_reason,
        updated_at = now()
    WHERE id = p_deal_id;

    v_content := 'Deal marked as Lost. Reason: ' || p_lost_reason;
    v_meta := jsonb_build_object(
      'old_stage', v_old_stage,
      'new_stage', 'lost',
      'lost_reason', p_lost_reason
    );

  ELSE
    UPDATE app.deals
    SET stage = p_new_stage,
        lost_reason = NULL,
        updated_at = now()
    WHERE id = p_deal_id;

    v_content := 'Stage changed from ' || v_old_stage || ' to ' || p_new_stage;
    v_meta := jsonb_build_object(
      'old_stage', v_old_stage,
      'new_stage', p_new_stage
    );
  END IF;

  -- Insert stage change timeline activity atomically
  INSERT INTO app.deal_activities (deal_id, actor_id, type, content, metadata)
  VALUES (p_deal_id, p_actor_id, 'stage_change', v_content, v_meta);
END;
$$;

-- ─── 4. New Atomic RPC: app.crm_update_deal_payment ──────────────

CREATE OR REPLACE FUNCTION app.crm_update_deal_payment(
  p_deal_id UUID,
  p_actor_id UUID,
  p_paid_amount NUMERIC,
  p_payment_method TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_stage TEXT;
  v_total NUMERIC(12,2);
  v_old_paid NUMERIC(12,2);
  v_remaining NUMERIC(12,2);
BEGIN
  SELECT stage, total_amount, paid_amount
  INTO v_stage, v_total, v_old_paid
  FROM app.deals
  WHERE id = p_deal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal not found: %', p_deal_id;
  END IF;

  IF v_stage <> 'won' THEN
    RAISE EXCEPTION 'Can only update payment for won deals';
  END IF;

  IF p_paid_amount < 0 THEN
    RAISE EXCEPTION 'Paid amount cannot be negative';
  END IF;

  IF p_paid_amount > v_total THEN
    RAISE EXCEPTION 'Paid amount (%) cannot exceed total amount (%)', p_paid_amount, v_total;
  END IF;

  v_remaining := v_total - p_paid_amount;

  UPDATE app.deals
  SET paid_amount = p_paid_amount,
      remaining_amount = v_remaining,
      payment_method = COALESCE(p_payment_method, payment_method),
      updated_at = now()
  WHERE id = p_deal_id;

  INSERT INTO app.deal_activities (deal_id, actor_id, type, content, metadata)
  VALUES (
    p_deal_id,
    p_actor_id,
    'note',
    'Payment updated: Paid ' || p_paid_amount || ' EGP of ' || v_total || ' EGP (Remaining: ' || v_remaining || ' EGP)' ||
      CASE WHEN p_payment_method IS NOT NULL THEN ', Method: ' || p_payment_method ELSE '' END,
    jsonb_build_object(
      'old_paid', v_old_paid,
      'new_paid', p_paid_amount,
      'total_amount', v_total,
      'remaining_amount', v_remaining,
      'payment_method', p_payment_method
    )
  );
END;
$$;

-- ─── 5. Expose RPCs to public schema (service_role ONLY) ─────────

CREATE OR REPLACE FUNCTION public.crm_create_deal(
  p_title TEXT,
  p_customer_id UUID,
  p_assigned_to UUID,
  p_total_amount NUMERIC DEFAULT NULL,
  p_expected_close_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  RETURN app.crm_create_deal(
    p_title, p_customer_id, p_assigned_to,
    p_total_amount, p_expected_close_date, p_notes, p_created_by
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_change_deal_stage(
  p_deal_id UUID,
  p_new_stage TEXT,
  p_actor_id UUID,
  p_lost_reason TEXT DEFAULT NULL,
  p_total_amount NUMERIC DEFAULT NULL,
  p_paid_amount NUMERIC DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  PERFORM app.crm_change_deal_stage(
    p_deal_id, p_new_stage, p_actor_id, p_lost_reason,
    p_total_amount, p_paid_amount, p_payment_method
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_update_deal_payment(
  p_deal_id UUID,
  p_actor_id UUID,
  p_paid_amount NUMERIC,
  p_payment_method TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  PERFORM app.crm_update_deal_payment(
    p_deal_id, p_actor_id, p_paid_amount, p_payment_method
  );
END;
$$;

-- Strictly grant execution only to service_role (Admin client)
REVOKE ALL ON FUNCTION public.crm_create_deal(TEXT, UUID, UUID, NUMERIC, DATE, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_create_deal(TEXT, UUID, UUID, NUMERIC, DATE, TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.crm_change_deal_stage(UUID, TEXT, UUID, TEXT, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_change_deal_stage(UUID, TEXT, UUID, TEXT, NUMERIC, NUMERIC, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.crm_update_deal_payment(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_update_deal_payment(UUID, UUID, NUMERIC, TEXT) TO service_role;

-- ─── 6. Refresh public.deals View ────────────────────────────────

DROP VIEW IF EXISTS public.deals CASCADE;

CREATE VIEW public.deals WITH (security_invoker = true) AS
  SELECT * FROM app.deals;

GRANT SELECT, INSERT, UPDATE ON public.deals TO authenticated;
GRANT ALL ON public.deals TO service_role;

COMMENT ON TABLE app.deals IS 'Tourism CRM commercial deals tracking leads and payment information';
COMMENT ON COLUMN app.deals.total_amount IS 'Total booking amount in EGP';
COMMENT ON COLUMN app.deals.paid_amount IS 'Amount paid by customer so far in EGP';
COMMENT ON COLUMN app.deals.remaining_amount IS 'Remaining balance = total_amount - paid_amount';
COMMENT ON COLUMN app.deals.payment_method IS 'Payment channel (cash, bank_transfer, credit_card, vodafone_cash, instapay, other)';
