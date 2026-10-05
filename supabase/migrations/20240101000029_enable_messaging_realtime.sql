-- supabase/migrations/20240101000029_enable_messaging_realtime.sql
-- Enables Supabase Realtime (CDC / postgres_changes) for Unified Messaging Inbox.
-- 1. Adds app.conversations, app.messages, app.channel_identities, app.leads to supabase_realtime publication
-- 2. Sets REPLICA IDENTITY FULL so updates/deletes contain full record data in Realtime broadcasts

-- 1. Ensure publication exists and add tables
DO $$
BEGIN
  -- Enable supabase_realtime publication if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE app.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE app.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE app.channel_identities;
ALTER PUBLICATION supabase_realtime ADD TABLE app.leads;

-- 2. Set replica identity to FULL
ALTER TABLE app.conversations REPLICA IDENTITY FULL;
ALTER TABLE app.messages REPLICA IDENTITY FULL;
ALTER TABLE app.channel_identities REPLICA IDENTITY FULL;
ALTER TABLE app.leads REPLICA IDENTITY FULL;

-- 3. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
