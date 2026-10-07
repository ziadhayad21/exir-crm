-- 20240101000043_expand_customers_source_check.sql
-- Expand customers_source_check constraint to include omnichannel sources (whatsapp, phone_call, instagram, messenger)

ALTER TABLE app.customers
  DROP CONSTRAINT IF EXISTS customers_source_check;

ALTER TABLE app.customers
  ADD CONSTRAINT customers_source_check
  CHECK (source IN (
    'manual',
    'referral',
    'walk_in',
    'website',
    'social_media',
    'whatsapp',
    'phone_call',
    'instagram',
    'messenger',
    'other'
  ));

-- Refresh public view for customers
CREATE OR REPLACE VIEW public.customers AS
SELECT * FROM app.customers;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated, anon;
NOTIFY pgrst, 'reload schema';
