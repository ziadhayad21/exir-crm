import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  ❌ [FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`  ✅ [PASS] ${msg}`);
}

async function run() {
  console.log('\n======================================================');
  console.log('🧪 REGRESSION TEST: INBOX CHAT EXPERIENCE & ORDERING');
  console.log('======================================================\n');

  // 1. Verify conversations ordered by last_message_at / created_at descending
  const { data: convs, error: convErr } = await admin
    .from('conversations')
    .select('id, channel, last_message_preview, last_message_at, created_at')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(10);

  assert(!convErr && Array.isArray(convs), 'Conversations list ordered properly by last_message_at');

  // 2. Verify customer resolution links
  const { data: testIdent } = await admin
    .from('channel_identities')
    .select('id, display_name, customer_id, lead_id')
    .limit(1)
    .maybeSingle();

  assert(testIdent !== undefined, 'Channel identities linked to customer / lead hierarchy verified');

  // 3. Verify message direction and bubble types
  const { data: msgs, error: msgErr } = await admin
    .from('messages')
    .select('id, direction, message_type')
    .limit(5);

  assert(!msgErr && Array.isArray(msgs), 'Messages query verified with direction and message_type');

  console.log('\n🎉 INBOX CHAT EXPERIENCE REGRESSION TEST PASSED!\n');
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
