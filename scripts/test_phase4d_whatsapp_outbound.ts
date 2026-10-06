import { checkOutboundMediaRules } from '../src/lib/messaging/media-manager';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

function assert(condition: unknown, msg: string) {
  if (!condition) {
    console.error(`  ❌ [FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`  ✅ [PASS] ${msg}`);
}

async function run() {
  console.log('\n======================================================');
  console.log('🧪 REGRESSION TEST: PHASE 4D WHATSAPP OUTBOUND');
  console.log('======================================================\n');

  // 1. WhatsApp 24-hour customer service window rule
  const now = Date.now();
  const past25h = new Date(now - 25 * 3600 * 1000).toISOString();
  const past1h = new Date(now - 1 * 3600 * 1000).toISOString();

  const expiredWindowCheck = checkOutboundMediaRules({
    channel: 'whatsapp',
    mediaType: 'image',
    lastMessageAt: past25h,
    recipientId: '+201011112222',
  });
  assert(!expiredWindowCheck.allowed, 'WhatsApp 24h window strictly enforced for outbound');
  assert(expiredWindowCheck.error?.includes('24-hour'), 'Rejection reason cites 24-hour window');

  const activeWindowCheck = checkOutboundMediaRules({
    channel: 'whatsapp',
    mediaType: 'image',
    lastMessageAt: past1h,
    recipientId: '+201011112222',
  });
  assert(activeWindowCheck.allowed, 'Active WhatsApp window allows outbound transmission');

  // 2. Outbound message status transitions
  const convId = crypto.randomUUID();
  const msgId = crypto.randomUUID();

  // Fetch existing channel identity
  const { data: ident } = await admin
    .from('channel_identities')
    .select('id')
    .limit(1)
    .single();

  const identId = ident?.id || crypto.randomUUID();

  // Create temporary conversation
  await admin.from('conversations').insert({
    id: convId,
    channel: 'whatsapp',
    channel_identity_id: identId,
    external_thread_id: `thread_wa_out_${Date.now()}`,
    status: 'open',
  });

  // Insert message initially as sending
  const { data: sentMsg, error: insertErr } = await admin.from('messages').insert({
    id: msgId,
    conversation_id: convId,
    direction: 'outbound',
    sender_type: 'employee',
    message_type: 'text',
    content: 'Outbound test message',
    status: 'sending',
  }).select().single();

  assert(!insertErr && sentMsg?.status === 'sending', 'Message inserted with status=sending');

  // Update to delivered
  const { data: updatedMsg } = await admin.from('messages').update({
    status: 'delivered',
  }).eq('id', msgId).select().single();

  assert(updatedMsg?.status === 'delivered', 'Message status transitioned cleanly to delivered');

  // Clean up fixtures
  await admin.from('messages').delete().eq('id', msgId);
  await admin.from('conversations').delete().eq('id', convId);

  console.log('\n🎉 PHASE 4D WHATSAPP OUTBOUND REGRESSION TEST PASSED!\n');
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
