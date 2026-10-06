import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const admin = createClient(supabaseUrl, serviceRoleKey);
const authClient = createClient(supabaseUrl, anonKey);

async function checkRLS() {
  const { data: authData, error: authErr } = await authClient.auth.signInWithPassword({
    email: 'admin@elexir.test',
    password: 'Admin123!',
  });
  console.log('Admin login error:', authErr, 'User ID:', authData?.user?.id);

  const { data: convs, error: convErr } = await authClient
    .from('conversations')
    .select('id, channel, last_message_preview')
    .limit(5);
  console.log('Conversations visible to Admin via authClient:', convs?.length, convErr);

  if (convs && convs.length > 0) {
    const testConvId = convs[0].id;
    console.log('Testing messages query for conversation:', testConvId);

    const { data: msgsAuth, error: msgsAuthErr } = await authClient
      .from('messages')
      .select('*')
      .eq('conversation_id', testConvId);
    console.log('Messages query with authClient:', {
      count: msgsAuth?.length,
      error: msgsAuthErr,
      sample: msgsAuth?.[0]?.content,
    });

    const { data: msgsAdmin, error: msgsAdminErr } = await admin
      .from('messages')
      .select('*')
      .eq('conversation_id', testConvId);
    console.log('Messages query with admin:', {
      count: msgsAdmin?.length,
      error: msgsAdminErr,
      sample: msgsAdmin?.[0]?.content,
    });
  }

  process.exit(0);
}

checkRLS().catch(console.error);
