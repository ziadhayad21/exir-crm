import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createAdminClient } from '../src/lib/supabase/admin';

async function main() {
  const admin = createAdminClient();
  const { data: leads, error } = await admin.from('leads').select('*');
  if (error) {
    console.error('Error fetching leads:', error);
    return;
  }
  console.log('Leads:', JSON.stringify(leads, null, 2));
}

main().catch(console.error);
