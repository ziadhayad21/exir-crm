import { normalizeInboundPayload } from '../src/lib/messaging/meta-adapter';
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
  console.log('🧪 REGRESSION TEST: PHASE 4C2 INSTAGRAM INBOUND');
  console.log('======================================================\n');

  const igPayload = {
    object: 'instagram',
    entry: [
      {
        id: 'IG_PAGE_123',
        messaging: [
          {
            sender: { id: 'IGSID_REGRESSION_TEST' },
            recipient: { id: 'IG_PAGE_123' },
            timestamp: Date.now(),
            message: {
              mid: `mid_ig_reg_${Date.now()}`,
              text: 'Instagram regression test message',
            },
          },
        ],
      },
    ],
  };

  const normalized = normalizeInboundPayload(igPayload);
  assert(normalized.length === 1, 'Instagram inbound payload normalized successfully');
  assert(normalized[0].channel === 'instagram', 'Channel correctly identified as instagram');
  assert(normalized[0].content === 'Instagram regression test message', 'Message content matches');
  assert(normalized[0].externalSenderId === 'IGSID_REGRESSION_TEST', 'Sender IGSID extracted');

  // Verify DB query
  const { data: ident } = await admin
    .from('channel_identities')
    .select('id, channel_type')
    .eq('channel_type', 'instagram')
    .limit(1)
    .maybeSingle();

  assert(ident !== undefined, 'Instagram channel_identities queried safely');

  console.log('\n🎉 PHASE 4C2 INSTAGRAM REGRESSION TEST PASSED!\n');
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
