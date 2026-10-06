import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function wipeData() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ Missing Supabase environment variables.');
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  console.log('🗑️ Starting Database Wipe (Keeping Accounts/Employees)...');

  // Ordered properly to respect foreign key constraints (child tables first)
  const tablesToWipe = [
    'message_attachments',
    'messages',
    'conversations',
    'channel_identities',
    'webhook_events',
    'deal_activities',
    'deals',
    'leads',
    'customers',
    // 'services', // Uncomment if you want to delete services/products too
  ];

  // A dummy UUID that will never match, forcing Supabase to scan and delete all rows
  // (Using a valid UUID format prevents PostgreSQL type casting errors)
  const DUMMY_UUID = '00000000-0000-0000-0000-000000000000';

  for (const table of tablesToWipe) {
    console.log(`Clearing ${table}...`);
    const { error } = await admin.from(table).delete().neq('id', DUMMY_UUID);
    
    if (error) {
      console.error(`❌ Failed to clear ${table}:`, error.message);
    } else {
      console.log(`✅ ${table} cleared successfully.`);
    }
  }

  console.log('\n🎉 Database wipe complete!');
  console.log('All operational data (Inbox, CRM, Leads) removed.');
  console.log('Accounts, Roles, and Permissions were preserved.');
}

wipeData().catch(console.error);
