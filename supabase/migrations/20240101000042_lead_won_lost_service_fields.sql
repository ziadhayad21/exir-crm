-- 20240101000042_lead_won_lost_service_fields.sql
-- Add service_name and service_type to app.leads to capture Won & Lose details for Finance

ALTER TABLE app.leads
  ADD COLUMN IF NOT EXISTS service_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS service_type TEXT DEFAULT NULL;

-- Update app.update_lead_commercial_details to accept service_name and service_type
CREATE OR REPLACE FUNCTION app.update_lead_commercial_details(
  p_lead_id UUID,
  p_actor_id UUID DEFAULT NULL,
  p_trip_details TEXT DEFAULT NULL,
  p_travelers_count INT DEFAULT NULL,
  p_total_amount NUMERIC DEFAULT NULL,
  p_currency TEXT DEFAULT 'EGP',
  p_paid_amount NUMERIC DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_quotation_details JSONB DEFAULT NULL,
  p_booking_details JSONB DEFAULT NULL,
  p_expected_close_date DATE DEFAULT NULL,
  p_lost_reason TEXT DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL,
  p_service_name TEXT DEFAULT NULL,
  p_service_type TEXT DEFAULT NULL
)
RETURNS app.leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_lead app.leads%ROWTYPE;
  v_effective_total NUMERIC(12,2);
  v_effective_paid NUMERIC(12,2);
  v_remaining NUMERIC(12,2);
  v_updated app.leads%ROWTYPE;
BEGIN
  SELECT * INTO v_lead
  FROM app.leads
  WHERE id = p_lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id;
  END IF;

  v_effective_total := COALESCE(p_total_amount, v_lead.total_amount);
  v_effective_paid := COALESCE(p_paid_amount, v_lead.paid_amount, 0);

  IF v_effective_total IS NOT NULL AND v_effective_paid IS NOT NULL AND v_effective_paid > v_effective_total THEN
    RAISE EXCEPTION 'Paid amount (%) cannot exceed total amount (%)', v_effective_paid, v_effective_total;
  END IF;

  IF v_effective_total IS NOT NULL THEN
    v_remaining := GREATEST(0, v_effective_total - v_effective_paid);
  ELSE
    v_remaining := NULL;
  END IF;

  UPDATE app.leads
  SET trip_details = COALESCE(p_trip_details, trip_details),
      travelers_count = COALESCE(p_travelers_count, travelers_count),
      total_amount = v_effective_total,
      currency = COALESCE(p_currency, currency, 'EGP'),
      paid_amount = v_effective_paid,
      remaining_amount = v_remaining,
      payment_method = COALESCE(p_payment_method, payment_method),
      quotation_details = COALESCE(p_quotation_details, quotation_details),
      booking_details = COALESCE(p_booking_details, booking_details),
      expected_close_date = COALESCE(p_expected_close_date, expected_close_date),
      lost_reason = COALESCE(p_lost_reason, lost_reason),
      customer_id = COALESCE(p_customer_id, customer_id),
      service_name = COALESCE(p_service_name, service_name),
      service_type = COALESCE(p_service_type, service_type),
      updated_at = now()
  WHERE id = p_lead_id
  RETURNING * INTO v_updated;

  RETURN v_updated;
END;
$$;

-- Overload/update public RPC
CREATE OR REPLACE FUNCTION public.update_lead_commercial_details(
  p_lead_id UUID,
  p_actor_id UUID DEFAULT NULL,
  p_trip_details TEXT DEFAULT NULL,
  p_travelers_count INT DEFAULT NULL,
  p_total_amount NUMERIC DEFAULT NULL,
  p_currency TEXT DEFAULT 'EGP',
  p_paid_amount NUMERIC DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_quotation_details JSONB DEFAULT NULL,
  p_booking_details JSONB DEFAULT NULL,
  p_expected_close_date DATE DEFAULT NULL,
  p_lost_reason TEXT DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL,
  p_service_name TEXT DEFAULT NULL,
  p_service_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_res app.leads%ROWTYPE;
BEGIN
  v_res := app.update_lead_commercial_details(
    p_lead_id, p_actor_id, p_trip_details, p_travelers_count,
    p_total_amount, p_currency, p_paid_amount, p_payment_method,
    p_quotation_details, p_booking_details, p_expected_close_date,
    p_lost_reason, p_customer_id, p_service_name, p_service_type
  );
  RETURN to_jsonb(v_res);
END;
$$;

-- Refresh public view
CREATE OR REPLACE VIEW public.leads AS
SELECT * FROM app.leads;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated, anon;
NOTIFY pgrst, 'reload schema';
