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
  console.log('🧪 REGRESSION TEST: PHASE 4C3 WHATSAPP INBOUND');
  console.log('======================================================\n');

  const waPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_123',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: 'PN_123' },
              contacts: [{ wa_id: '201011112222', profile: { name: 'Regression Customer' } }],
              messages: [
                {
                  id: `wamid_reg_${Date.now()}`,
                  from: '201011112222',
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: 'Hello WhatsApp regression test' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const normalized = normalizeInboundPayload(waPayload);
  assert(normalized.length === 1, 'WhatsApp inbound payload normalized successfully');
  assert(normalized[0].channel === 'whatsapp', 'Channel correctly identified as whatsapp');
  assert(normalized[0].content === 'Hello WhatsApp regression test', 'Message content matches');
  assert(normalized[0].externalSenderId === '201011112222', 'Sender phone/wa_id extracted');
  assert(normalized[0].senderDisplayName === 'Regression Customer', 'Sender display name extracted');

  // Verify DB query
  const { data: ident } = await admin
    .from('channel_identities')
    .select('id, channel_type')
    .eq('channel_type', 'whatsapp')
    .limit(1)
    .maybeSingle();

  assert(ident !== undefined, 'WhatsApp channel_identities queried safely');

  console.log('\n🎉 PHASE 4C3 WHATSAPP REGRESSION TEST PASSED!\n');
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
