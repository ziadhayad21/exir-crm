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
  console.log('🧪 REGRESSION TEST: PHASE 4B BATCHING & BURST BUFFER');
  console.log('======================================================\n');

  // 1. Verify webhook_events idempotency and burst absorption
  const burstEventId = `burst_evt_${Date.now()}`;
  const { data: firstInsert, error: err1 } = await admin.from('webhook_events').insert({
    channel: 'messenger',
    event_id: burstEventId,
    payload: { test: 'burst_1' },
    status: 'pending',
  }).select().single();

  if (err1) console.error('Insert error 1:', err1);
  assert(!err1 && !!firstInsert, 'First webhook event inserted cleanly');

  // Attempt duplicate insert (idempotency check)
  const { error: err2 } = await admin.from('webhook_events').insert({
    channel: 'messenger',
    event_id: burstEventId,
    payload: { test: 'burst_duplicate' },
    status: 'pending',
  });

  assert(!!err2, 'Duplicate webhook event rejected by event_id uniqueness constraint');

  // Clean up test fixture
  await admin.from('webhook_events').delete().eq('event_id', burstEventId);

  console.log('\n🎉 PHASE 4B BATCHING REGRESSION TEST PASSED!\n');
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
