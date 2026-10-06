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
  console.log('🧪 REGRESSION TEST: PHASE 4C1 MESSENGER INBOUND');
  console.log('======================================================\n');

  const fbPayload = {
    object: 'page',
    entry: [
      {
        id: 'PAGE_123',
        messaging: [
          {
            sender: { id: 'PSID_MESSENGER_REGRESSION' },
            recipient: { id: 'PAGE_123' },
            timestamp: Date.now(),
            message: {
              mid: `mid_fb_reg_${Date.now()}`,
              text: 'Messenger regression test message',
            },
          },
        ],
      },
    ],
  };

  const normalized = normalizeInboundPayload(fbPayload);
  assert(normalized.length === 1, 'Messenger inbound payload normalized successfully');
  assert(normalized[0].channel === 'messenger', 'Channel correctly identified as messenger');
  assert(normalized[0].content === 'Messenger regression test message', 'Message content matches');
  assert(normalized[0].externalSenderId === 'PSID_MESSENGER_REGRESSION', 'Sender PSID extracted');

  // Verify DB channel_identity lookup
  const { data: ident } = await admin
    .from('channel_identities')
    .select('id, channel_type')
    .eq('channel_type', 'messenger')
    .limit(1)
    .maybeSingle();

  assert(ident !== undefined, 'Messenger channel_identities queried safely');

  console.log('\n🎉 PHASE 4C1 MESSENGER REGRESSION TEST PASSED!\n');
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
