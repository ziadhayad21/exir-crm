// scripts/verify_realtime_inbox.ts
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const admin = createClient(supabaseUrl, serviceRoleKey);
const authClient = createClient(supabaseUrl, anonKey);

interface IngestionRpcResult {
  success: boolean;
  conversation_id: string;
  message_id: string;
  lead_id: string | null;
  assigned_to: string | null;
  status: string;
  is_duplicate_message: boolean;
}

async function runVerification() {
  console.log('======================================================================');
  console.log('🚀 VERIFYING REALTIME MESSENGER & INSTAGRAM INBOX INGESTION');
  console.log('======================================================================\n');

  // 1. Sign in as Admin to test authenticated Realtime stream
  const { data: authData, error: authErr } = await authClient.auth.signInWithPassword({
    email: 'admin@elexir.test',
    password: 'Admin123!',
  });

  if (authErr || !authData.session) {
    throw new Error(`Admin sign in failed: ${authErr?.message}`);
  }
  console.log('✅ Signed in as Admin User:', authData.user.email);

  const receivedEvents: { type: string; table: string; data: Record<string, unknown> }[] = [];

  // 2. Set up realtime subscription matching inbox-client
  const channel = authClient
    .channel('verify-inbox-realtime')
    .on('postgres_changes', { event: '*', schema: 'app', table: 'messages' }, (payload) => {
      const row = payload.new as Record<string, unknown>;
      receivedEvents.push({ type: payload.eventType, table: 'messages', data: row });
      console.log(`  ⚡ [REALTIME EVENT] Message ${payload.eventType}: id=${row?.id} content="${row?.content}"`);
    })
    .on('postgres_changes', { event: '*', schema: 'app', table: 'conversations' }, (payload) => {
      const row = payload.new as Record<string, unknown>;
      receivedEvents.push({ type: payload.eventType, table: 'conversations', data: row });
      console.log(`  ⚡ [REALTIME EVENT] Conversation ${payload.eventType}: id=${row?.id} channel=${row?.channel} status=${row?.status}`);
    })
    .subscribe((status, err) => {
      console.log(`  📡 Channel subscription status: ${status} ${err || ''}`);
    });

  await new Promise((resolve) => setTimeout(resolve, 3000));

  // 3. Test Messenger Inbound Ingestion (pending_assignment)
  console.log('\n--- 1. Testing Messenger Inbound Ingestion ---');
  const messengerSenderId = `fb_test_${Date.now()}`;
  const messengerContent = `Hello from Messenger realtime test ${Date.now()}`;

  const { data: messengerResultRaw, error: messengerErr } = await admin.rpc('ingest_inbound_message', {
    p_raw_event_id: null,
    p_channel: 'messenger',
    p_external_sender_id: messengerSenderId,
    p_sender_display_name: 'Messenger Realtime User',
    p_sender_phone: null,
    p_external_thread_id: `thread_${messengerSenderId}`,
    p_external_message_id: `msg_fb_${Date.now()}`,
    p_message_type: 'text',
    p_content: messengerContent,
    p_media_url: null,
    p_business_tz: 'Africa/Cairo',
  });

  if (messengerErr) {
    throw new Error(`Messenger ingestion RPC failed: ${messengerErr.message}`);
  }
  const messengerResult = messengerResultRaw as unknown as IngestionRpcResult;
  console.log('✅ Messenger Ingestion Result:', messengerResult);

  // 4. Test Instagram Inbound Ingestion (pending_assignment)
  console.log('\n--- 2. Testing Instagram Inbound Ingestion ---');
  const instagramSenderId = `ig_test_${Date.now()}`;
  const instagramContent = `Hello from Instagram realtime test ${Date.now()}`;

  const { data: instagramResultRaw, error: instagramErr } = await admin.rpc('ingest_inbound_message', {
    p_raw_event_id: null,
    p_channel: 'instagram',
    p_external_sender_id: instagramSenderId,
    p_sender_display_name: 'Instagram Realtime User',
    p_sender_phone: null,
    p_external_thread_id: `thread_${instagramSenderId}`,
    p_external_message_id: `msg_ig_${Date.now()}`,
    p_message_type: 'text',
    p_content: instagramContent,
    p_media_url: null,
    p_business_tz: 'Africa/Cairo',
  });

  if (instagramErr) {
    throw new Error(`Instagram ingestion RPC failed: ${instagramErr.message}`);
  }
  const instagramResult = instagramResultRaw as unknown as IngestionRpcResult;
  console.log('✅ Instagram Ingestion Result:', instagramResult);

  // Wait 5 seconds to collect realtime events
  console.log('\n--- 3. Collecting Realtime Events ---');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log(`\nTotal Realtime Events Received: ${receivedEvents.length}`);

  const hasMessengerConv = receivedEvents.some((e) => e.table === 'conversations' && e.data?.id === messengerResult.conversation_id);
  const hasMessengerMsg = receivedEvents.some((e) => e.table === 'messages' && e.data?.conversation_id === messengerResult.conversation_id);
  const hasInstagramConv = receivedEvents.some((e) => e.table === 'conversations' && e.data?.id === instagramResult.conversation_id);
  const hasInstagramMsg = receivedEvents.some((e) => e.table === 'messages' && e.data?.conversation_id === instagramResult.conversation_id);

  console.log('Messenger Conversation Event Received:', hasMessengerConv ? '✅ YES' : '❌ NO');
  console.log('Messenger Message Event Received:', hasMessengerMsg ? '✅ YES' : '❌ NO');
  console.log('Instagram Conversation Event Received:', hasInstagramConv ? '✅ YES' : '❌ NO');
  console.log('Instagram Message Event Received:', hasInstagramMsg ? '✅ YES' : '❌ NO');

  // 5. Cleanup test records
  console.log('\n--- 4. Cleaning Test Records ---');
  await admin.from('messages').delete().in('conversation_id', [messengerResult.conversation_id, instagramResult.conversation_id]);
  await admin.from('conversations').delete().in('id', [messengerResult.conversation_id, instagramResult.conversation_id]);
  if (messengerResult.lead_id) await admin.from('leads').delete().eq('id', messengerResult.lead_id);
  if (instagramResult.lead_id) await admin.from('leads').delete().eq('id', instagramResult.lead_id);

  await authClient.removeChannel(channel);

  if (!hasMessengerConv || !hasMessengerMsg || !hasInstagramConv || !hasInstagramMsg) {
    console.error('❌ Verification failed: Not all realtime events were received!');
    process.exit(1);
  }

  console.log('\n🎉 ALL REALTIME INGESTION TESTS PASSED FOR MESSENGER & INSTAGRAM!');
  process.exit(0);
}

runVerification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
