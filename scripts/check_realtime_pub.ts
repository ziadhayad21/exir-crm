import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const admin = createClient(supabaseUrl, serviceRoleKey);
const authClient = createClient(supabaseUrl, anonKey);

async function testRealtime() {
  console.log('1. Signing in as Admin...');
  const { data: auth, error: authErr } = await authClient.auth.signInWithPassword({
    email: 'admin@elexir.test',
    password: 'Admin123!',
  });
  if (authErr) {
    console.error('Auth error:', authErr);
    process.exit(1);
  }
  console.log('Admin logged in:', auth.user.email);

  const received: unknown[] = [];

  console.log('2. Subscribing to Realtime channels...');
  const chan = authClient
    .channel('test-browser-realtime')
    .on('postgres_changes', { event: '*', schema: 'app', table: 'messages' }, (p) => {
      console.log('⚡ Received app.messages event:', p.eventType, (p.new as Record<string, unknown>)?.content);
      received.push(p);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (p) => {
      console.log('⚡ Received public.messages event:', p.eventType, (p.new as Record<string, unknown>)?.content);
      received.push(p);
    })
    .on('postgres_changes', { event: '*', schema: 'app', table: 'conversations' }, (p) => {
      console.log('⚡ Received app.conversations event:', p.eventType, (p.new as Record<string, unknown>)?.id);
      received.push(p);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, (p) => {
      console.log('⚡ Received public.conversations event:', p.eventType, (p.new as Record<string, unknown>)?.id);
      received.push(p);
    })
    .subscribe((status, err) => {
      console.log('Subscription status:', status, err || '');
    });

  await new Promise((r) => setTimeout(r, 4000));

  console.log('3. Ingesting a test inbound message via RPC...');
  const { data: ingestRes, error: ingestErr } = await admin.rpc('ingest_inbound_message', {
    p_raw_event_id: null,
    p_channel: 'whatsapp',
    p_external_sender_id: '201099881122',
    p_sender_display_name: 'Realtime Live Tester',
    p_sender_phone: '+201099881122',
    p_external_thread_id: '201099881122',
    p_external_message_id: 'wamid_realtime_' + Date.now(),
    p_message_type: 'text',
    p_content: 'Realtime live message ping ' + Date.now(),
    p_media_url: null,
    p_business_tz: 'Africa/Cairo',
  });

  console.log('RPC result:', ingestRes, ingestErr || '');

  console.log('4. Waiting 5s for realtime event to arrive in subscriber...');
  await new Promise((r) => setTimeout(r, 5000));

  console.log(`Total events received: ${received.length}`);

  // Cleanup
  const res = ingestRes as { message_id?: string; conversation_id?: string } | null;
  if (res?.message_id) {
    await admin.from('messages').delete().eq('id', res.message_id);
  }
  if (res?.conversation_id) {
    await admin.from('conversations').delete().eq('id', res.conversation_id);
  }
  await authClient.removeChannel(chan);

  process.exit(0);
}

testRealtime().catch(console.error);
