import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

async function audit() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  // 1. Inspect messages table columns
  const { data: sampleMsg, error: msgErr } = await admin.from('messages').select('*').limit(1);
  if (msgErr) console.warn('Messages query error:', msgErr.message);
  console.log('Messages columns (sample keys):', sampleMsg && sampleMsg[0] ? Object.keys(sampleMsg[0]) : 'empty table');
  if (sampleMsg && sampleMsg[0]) {
    console.log('Sample message record:', sampleMsg[0]);
  }
  
  // 2. Check if message_attachments or storage buckets exist
  const { data: buckets, error: bucketErr } = await admin.storage.listBuckets();
  console.log('Storage buckets:', buckets?.map(b => ({ name: b.name, public: b.public, id: b.id })));
  if (bucketErr) {
    console.error('Bucket error:', bucketErr);
  }

  // 3. Check if message_attachments table exists
  const { data: attSample, error: attErr } = await admin.from('message_attachments').select('*').limit(1);
  console.log('message_attachments exists?:', !attErr, attErr?.message || (attSample ? 'Found' : 'Empty'));

  // 4. Check schema of webhook_events
  const { data: sampleWebhook } = await admin.from('webhook_events').select('*').limit(1);
  console.log('webhook_events columns:', sampleWebhook && sampleWebhook[0] ? Object.keys(sampleWebhook[0]) : 'none');

  // 5. Check schema of conversations
  const { data: sampleConv } = await admin.from('conversations').select('*').limit(1);
  console.log('conversations columns:', sampleConv && sampleConv[0] ? Object.keys(sampleConv[0]) : 'none');
}

audit();
