// scripts/inspect_db_data.ts
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(supabaseUrl, serviceRoleKey);

async function inspect() {
  console.log('--- RECENT CONVERSATIONS ---');
  const { data: convs, error: convErr } = await admin
    .from('conversations')
    .select('id, channel, channel_identity_id, lead_id, customer_id, unread_count, status, last_message_preview, updated_at')
    .order('updated_at', { ascending: false })
    .limit(10);
  if (convErr) console.error('Conv err:', convErr);
  console.log(convs);

  console.log('\n--- RECENT CHANNEL IDENTITIES ---');
  const { data: idents, error: identErr } = await admin
    .from('channel_identities')
    .select('id, channel, external_id, display_name, phone, email, profile_pic_url, metadata')
    .order('updated_at', { ascending: false })
    .limit(10);
  if (identErr) console.error('Ident err:', identErr);
  console.log(idents);

  console.log('\n--- RECENT LEADS ---');
  const { data: leads, error: leadErr } = await admin
    .from('leads')
    .select('id, full_name, phone, source, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  if (leadErr) console.error('Lead err:', leadErr);
  console.log(leads);

  console.log('\n--- RECENT RAW WEBHOOK EVENTS ---');
  const { data: rawEvents, error: rawErr } = await admin
    .from('webhook_events')
    .select('id, channel, raw_payload, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  if (rawErr) console.error('Raw err:', rawErr);
  console.log(JSON.stringify(rawEvents, null, 2));

  process.exit(0);
}

inspect().catch(console.error);
