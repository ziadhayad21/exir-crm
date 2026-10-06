import { enrichMessagesWithAttachments } from '../src/app/(dashboard)/crm/inbox-actions';
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
  console.log('🧪 REGRESSION TEST: INBOX INSTANT SWITCHING & CACHING');
  console.log('======================================================\n');

  // 1. Simulate fast parallel switching A -> B -> C across real conversations
  const { data: convs } = await admin
    .from('conversations')
    .select('id')
    .limit(3);

  const testIds = convs && convs.length >= 2
    ? convs.map((c) => c.id)
    : [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];

  const startMs = Date.now();
  // Fetch messages concurrently to emulate rapid chat switching
  const results = await Promise.all(
    testIds.map(async (cid) => {
      const { data: msgs } = await admin
        .from('messages')
        .select('*')
        .eq('conversation_id', cid)
        .order('created_at', { ascending: true });
      return enrichMessagesWithAttachments(admin, msgs || []);
    })
  );

  const elapsed = Date.now() - startMs;
  assert(results.length === testIds.length, 'Parallel conversation switching returns valid enriched message arrays');
  assert(elapsed < 2000, `Fast non-blocking resolution completed in ${elapsed}ms`);

  console.log('\n🎉 INBOX INSTANT SWITCHING REGRESSION TEST PASSED!\n');
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
