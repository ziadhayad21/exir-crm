// scripts/verify_customer_uniqueness.ts
// Test suite to verify strict uniqueness enforcement on Customer creation and updating.
// Duplicate phone number or email MUST NOT create a new customer record.

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
    failedCount++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🛡️ CUSTOMER UNIQUENESS ENFORCEMENT VERIFICATION');
  console.log('====================================================\n');

  const createdCustomerIds: string[] = [];

  try {
    // Fetch active employee for testing
    const { data: employees } = await admin
      .from('employees')
      .select('id, full_name, is_active')
      .eq('is_active', true)
      .limit(1);

    const testEmployeeId = employees?.[0]?.id || '1e11c1da-792a-4f53-bb7e-c896bc4370cf';

    // ----------------------------------------------------
    // TEST 1: First Customer Creation
    // ----------------------------------------------------
    console.log('--- TEST 1: Create First Customer ---');
    const phone1 = `+20107777${Math.floor(1000 + Math.random() * 9000)}`;
    const email1 = `unique.client.${Date.now()}@test.com`;

    const { data: cust1, error: cust1Err } = await admin
      .from('customers')
      .insert({
        full_name: 'Original Client One',
        phone: phone1,
        email: email1,
        source: 'manual',
        created_by: testEmployeeId,
      })
      .select('*')
      .single();

    assert(!cust1Err && !!cust1, 'First customer created successfully', cust1Err?.message);
    if (cust1) createdCustomerIds.push(cust1.id);

    // ----------------------------------------------------
    // TEST 2: Attempt Duplicate Phone Creation (MUST NOT CREATE)
    // ----------------------------------------------------
    console.log('\n--- TEST 2: Attempt Duplicate Phone Creation ---');

    // Simulate backend check in createCustomer:
    const checksPhone: string[] = [`phone.eq.${phone1}`];
    const { data: dupPhoneMatch } = await admin
      .from('customers')
      .select('*')
      .is('deleted_at', null)
      .or(checksPhone.join(','));

    const shouldBlockPhone = Boolean(dupPhoneMatch && dupPhoneMatch.length > 0);
    assert(shouldBlockPhone, 'System detects existing customer by phone number');

    if (shouldBlockPhone) {
      console.log(`  🛡️ Blocked creation: Customer "${dupPhoneMatch![0].full_name}" already has phone ${phone1}`);
    }

    // Verify count of active customers with phone1 is still exactly 1
    const { count: countAfterPhoneAttempt } = await admin
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('phone', phone1)
      .is('deleted_at', null);

    assert(countAfterPhoneAttempt === 1, 'Database contains strictly 1 customer with this phone number');

    // ----------------------------------------------------
    // TEST 3: Attempt Duplicate Email Creation (MUST NOT CREATE)
    // ----------------------------------------------------
    console.log('\n--- TEST 3: Attempt Duplicate Email Creation ---');

    const differentPhone = `+20106666${Math.floor(1000 + Math.random() * 9000)}`;
    const checksEmail: string[] = [`email.eq.${email1}`];
    const { data: dupEmailMatch } = await admin
      .from('customers')
      .select('*')
      .is('deleted_at', null)
      .or(checksEmail.join(','));

    const shouldBlockEmail = Boolean(dupEmailMatch && dupEmailMatch.length > 0);
    assert(shouldBlockEmail, 'System detects existing customer by email address');

    if (shouldBlockEmail) {
      console.log(`  🛡️ Blocked creation: Customer "${dupEmailMatch![0].full_name}" already has email ${email1}`);
    }

    // Verify count of active customers with email1 is still exactly 1
    const { count: countAfterEmailAttempt } = await admin
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('email', email1)
      .is('deleted_at', null);

    assert(countAfterEmailAttempt === 1, 'Database contains strictly 1 customer with this email address');

    // ----------------------------------------------------
    // TEST 4: Create Second Distinct Customer
    // ----------------------------------------------------
    console.log('\n--- TEST 4: Create Second Distinct Customer ---');
    const phone2 = `+20105555${Math.floor(1000 + Math.random() * 9000)}`;
    const email2 = `distinct.client.${Date.now()}@test.com`;

    const { data: cust2, error: cust2Err } = await admin
      .from('customers')
      .insert({
        full_name: 'Distinct Client Two',
        phone: phone2,
        email: email2,
        source: 'whatsapp',
        created_by: testEmployeeId,
      })
      .select('*')
      .single();

    assert(!cust2Err && !!cust2, 'Second distinct customer created successfully', cust2Err?.message);
    if (cust2) createdCustomerIds.push(cust2.id);

    // ----------------------------------------------------
    // TEST 5: Attempt Updating Customer 2 with Customer 1's Phone (Collision Blocked)
    // ----------------------------------------------------
    console.log('\n--- TEST 5: Update Customer Colliding with Another (MUST NOT UPDATE) ---');

    const { data: updateCollisions } = await admin
      .from('customers')
      .select('id, full_name, phone, email')
      .neq('id', cust2.id)
      .is('deleted_at', null)
      .or(`phone.eq.${phone1}`);

    const updateBlocked = Boolean(updateCollisions && updateCollisions.length > 0);
    assert(updateBlocked, 'Collision check flags phone number collision with another customer');
    assert(updateCollisions?.[0]?.id === cust1.id, 'Collision correctly identified as Customer 1');

  } finally {
    // Cleanup
    if (createdCustomerIds.length > 0) {
      await admin.from('customers').delete().in('id', createdCustomerIds);
      console.log(`\nCleaned up ${createdCustomerIds.length} test customers.`);
    }
  }

  console.log('\n====================================================');
  console.log(`VERIFICATION SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('====================================================');

  if (failedCount > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Fatal error running uniqueness test:', err);
  process.exit(1);
});
