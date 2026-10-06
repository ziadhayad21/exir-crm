import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function inspect() {
  // Let's test with a direct admin query on messages
  const { data: msgs } = await admin.from('messages').select('id, conversation_id, content').limit(3);
  console.log('Sample messages:', msgs);

  process.exit(0);
}

inspect().catch(console.error);
