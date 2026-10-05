// scripts/test_realtime_diag.ts
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const admin = createClient(supabaseUrl, serviceRoleKey);
const authClient = createClient(supabaseUrl, anonKey);

async function main() {
  console.log('Signing in as admin@elexir.test...');
  const { data: authData, error: authErr } = await authClient.auth.signInWithPassword({
    email: 'admin@elexir.test',
    password: 'Admin123!',
  });

  if (authErr || !authData.session) {
    console.error('Sign in failed:', authErr?.message);
    process.exit(1);
  }
  console.log('Signed in successfully as Admin (user id:', authData.user.id, ')');

  // Test subscribing to 'app' vs 'public' schema
  const chPublic = authClient
    .channel('test-public-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, (payload) => {
      console.log('>>> [PUBLIC SCHEMA CONV EVENT RECEIVED]:', payload.eventType, payload.new);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
      console.log('>>> [PUBLIC SCHEMA MSG EVENT RECEIVED]:', payload.eventType, payload.new);
    })
    .subscribe((status, err) => {
      console.log('Public channel status:', status, err || '');
    });

  const chApp = authClient
    .channel('test-app-channel')
    .on('postgres_changes', { event: '*', schema: 'app', table: 'conversations' }, (payload) => {
      console.log('>>> [APP SCHEMA CONV EVENT RECEIVED]:', payload.eventType, payload.new);
    })
    .on('postgres_changes', { event: '*', schema: 'app', table: 'messages' }, (payload) => {
      console.log('>>> [APP SCHEMA MSG EVENT RECEIVED]:', payload.eventType, payload.new);
    })
    .subscribe((status, err) => {
      console.log('App channel status:', status, err || '');
    });

  const chWildcard = authClient
    .channel('test-wildcard-channel')
    .on('postgres_changes', { event: '*' }, (payload) => {
      console.log('>>> [WILDCARD SCHEMA EVENT RECEIVED]:', payload.eventType, payload.schema, payload.table);
    })
    .subscribe((status, err) => {
      console.log('Wildcard channel status:', status, err || '');
    });

  // Wait 3 seconds for subscriptions to establish
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log('\nTriggering a test insert into app.conversations via admin...');
  // Find or create channel identity
  const { data: ident } = await admin.from('channel_identities').select('id').limit(1).maybeSingle();
  let identId = ident?.id;
  if (!identId) {
    const { data: newIdent } = await admin.from('channel_identities').insert({
      channel: 'messenger',
      external_id: `test_diag_${Date.now()}`,
      display_name: 'Diag Test User',
    }).select('id').single();
    identId = newIdent?.id;
  }

  const testThreadId = `diag_thread_${Date.now()}`;
  const { data: newConv, error: convErr } = await admin.from('conversations').insert({
    channel: 'messenger',
    external_thread_id: testThreadId,
    channel_identity_id: identId,
    status: 'pending_assignment',
    last_message_preview: 'Diag test message',
  }).select('*').single();

  console.log('Insert conversation result:', { newConv: newConv?.id, convErr });

  if (newConv) {
    const { data: newMsg, error: msgErr } = await admin.from('messages').insert({
      conversation_id: newConv.id,
      direction: 'inbound',
      sender_type: 'contact',
      content: 'Hello realtime test',
      status: 'received',
    }).select('*').single();
    console.log('Insert message result:', { newMsg: newMsg?.id, msgErr });
  }

  // Wait 6 seconds to observe events
  await new Promise((resolve) => setTimeout(resolve, 6000));

  // Cleanup
  if (newConv) {
    await admin.from('messages').delete().eq('conversation_id', newConv.id);
    await admin.from('conversations').delete().eq('id', newConv.id);
  }

  await authClient.removeChannel(chPublic);
  await authClient.removeChannel(chApp);
  await authClient.removeChannel(chWildcard);

  console.log('Diagnostics completed.');
  process.exit(0);
}

main().catch(console.error);
