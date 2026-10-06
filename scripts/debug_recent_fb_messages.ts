import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: convs } = await admin.from('conversations').select('id, channel, last_message_preview, channel_identity_id, created_at').order('created_at', { ascending: false }).limit(6);
  console.log('--- RECENT CONVERSATIONS ---');
  console.log(JSON.stringify(convs, null, 2));

  const { data: idents } = await admin.from('channel_identities').select('id, channel, external_id, display_name, avatar_url').order('created_at', { ascending: false }).limit(6);
  console.log('--- RECENT IDENTS ---');
  console.log(JSON.stringify(idents, null, 2));

  const { data: events } = await admin.from('webhook_events').select('id, channel, event_id, payload, created_at').order('created_at', { ascending: false }).limit(6);
  console.log('--- RECENT WEBHOOK EVENTS ---');
  console.log(JSON.stringify(events, null, 2));
}

main().catch(console.error);
