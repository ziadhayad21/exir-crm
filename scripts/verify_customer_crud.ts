// scripts/verify_customer_crud.ts
// Comprehensive verification test suite for Customer CRUD & Soft Delete

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import {
  createCustomerSchema,
  deleteCustomerSchema,
} from '../src/lib/validations/crm';

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
  console.log('🚀 CUSTOMER CRUD & SOFT DELETE VERIFICATION SUITE');
  console.log('====================================================\n');

  // Fetch active employee for testing
  const { data: employees, error: empError } = await admin
    .from('employees')
    .select('id, full_name, is_active')
    .eq('is_active', true)
    .limit(1);

  if (empError || !employees || employees.length === 0) {
    throw new Error(`Failed to fetch active employee: ${empError?.message || 'None found'}`);
  }

  const testEmployee = employees[0];
  console.log(`Using test employee: ${testEmployee.full_name} (${testEmployee.id})\n`);

  // ----------------------------------------------------
  // TEST GROUP 1: Zod Validation Schemas
  // ----------------------------------------------------
  console.log('📋 Test Group 1: Customer Validation Schemas');

  // 1.1 Phone and Full Name are required
  const validCustomer = {
    full_name: 'Mahmoud El-Sayed',
    phone: '+20 101 234 5678',
    email: 'mahmoud@example.com',
    notes: 'VIP customer',
  };
  assert(createCustomerSchema.safeParse(validCustomer).success, 'Valid customer schema passes');

  // 1.2 Missing phone fails
  const missingPhone = {
    full_name: 'Mahmoud El-Sayed',
    email: 'mahmoud@example.com',
  };
  assert(!createCustomerSchema.safeParse(missingPhone).success, 'Missing phone is rejected by schema');

  // 1.3 Missing full_name fails
  const missingName = {
    phone: '+20 101 234 5678',
  };
  assert(!createCustomerSchema.safeParse(missingName).success, 'Missing full_name is rejected by schema');

  // 1.4 Optional email and notes pass when omitted
  const minimalCustomer = {
    full_name: 'Sara Nour',
    phone: '+20 102 345 6789',
  };
  assert(createCustomerSchema.safeParse(minimalCustomer).success, 'Customer without optional email/notes passes');

  // 1.5 Delete schema validation
  assert(
    deleteCustomerSchema.safeParse({ id: '11111111-1111-1111-1111-111111111111' }).success,
    'Valid UUID passes deleteCustomerSchema'
  );
  assert(
    !deleteCustomerSchema.safeParse({ id: 'not-a-uuid' }).success,
    'Invalid UUID rejected by deleteCustomerSchema'
  );

  console.log('\n----------------------------------------------------');
  console.log('📋 Test Group 2: Database Operations & Soft Delete');
  console.log('----------------------------------------------------');

  const uniquePhone = `+201099${Math.floor(100000 + Math.random() * 900000)}`;
  const uniqueEmail = `test_customer_${Date.now()}@example.com`;

  // 2.1 Create Customer
  const { data: createdCust1, error: cErr1 } = await admin
    .from('customers')
    .insert({
      full_name: 'Test Customer Alpha',
      phone: uniquePhone,
      email: uniqueEmail,
      notes: 'Initial test notes',
      created_by: testEmployee.id,
    })
    .select('*')
    .single();

  assert(!cErr1 && !!createdCust1, 'Customer 1 created in database', cErr1?.message);
  assert(createdCust1?.deleted_at === null, 'Customer 1 initially has deleted_at = null');

  // 2.2 Deduplication detection: querying active customers for existing phone/email
  const { data: duplicates } = await admin
    .from('customers')
    .select('*')
    .is('deleted_at', null)
    .or(`phone.eq.${uniquePhone},email.eq.${uniqueEmail}`);

  assert(
    Boolean((duplicates?.length ?? 0) >= 1 && duplicates?.some((d) => d.id === createdCust1?.id)),
    'Soft deduplication query identifies existing active customer by phone/email'
  );

  // 2.3 Create duplicate customer with forced bypass (does NOT merge)
  const { data: createdCust2, error: cErr2 } = await admin
    .from('customers')
    .insert({
      full_name: 'Test Customer Beta (Duplicate Phone)',
      phone: uniquePhone,
      email: `other_${Date.now()}@example.com`,
      notes: 'Forced creation without merge',
      created_by: testEmployee.id,
    })
    .select('*')
    .single();

  assert(!cErr2 && !!createdCust2, 'Forced duplicate customer created successfully without merging', cErr2?.message);
  assert(createdCust1.id !== createdCust2.id, 'Duplicate customer has separate distinct identity/ID');

  // 2.4 Edit / Update Customer
  const { data: updatedCust1, error: uErr } = await admin
    .from('customers')
    .update({
      full_name: 'Test Customer Alpha (Updated)',
      notes: 'Updated VIP notes',
      updated_at: new Date().toISOString(),
    })
    .eq('id', createdCust1.id)
    .select('*')
    .single();

  assert(!uErr && updatedCust1?.full_name === 'Test Customer Alpha (Updated)', 'Customer updated successfully', uErr?.message);

  // 2.5 Soft Delete Customer without Deals
  const deleteTimestamp = new Date().toISOString();
  const { data: softDeletedCust, error: dErr } = await admin
    .from('customers')
    .update({
      deleted_at: deleteTimestamp,
      updated_at: deleteTimestamp,
    })
    .eq('id', createdCust2.id)
    .select('*')
    .single();

  assert(!dErr && !!softDeletedCust?.deleted_at, 'Customer soft deleted (deleted_at timestamp set)', dErr?.message);

  // 2.6 Verify active customer query excludes soft-deleted customer
  const { data: activeCustomers } = await admin
    .from('customers')
    .select('*')
    .is('deleted_at', null)
    .eq('id', createdCust2.id);

  assert((activeCustomers?.length ?? 0) === 0, 'Active query correctly excludes soft-deleted customer');

  // 2.7 Verify public.customers view exists and reflects deleted_at
  const { data: viewCustomers, error: vErr } = await admin
    .from('customers')
    .select('id, full_name, deleted_at')
    .eq('id', createdCust2.id);

  assert(!vErr && viewCustomers?.[0]?.deleted_at !== null, 'public.customers view reflects deleted_at column');

  // 2.8 Relational Integrity: Protect customer with deals from deletion
  // Create a deal attached to createdCust1
  const { data: testDeal, error: dealErr } = await admin
    .from('deals')
    .insert({
      title: 'Deal for Relational Integrity Test',
      customer_id: createdCust1.id,
      assigned_to: testEmployee.id,
      stage: 'new',
      total_amount: 5000,
      value: 5000,
      currency: 'EGP',
      paid_amount: 0,
      remaining_amount: 5000,
      created_by: testEmployee.id,
    })
    .select('*')
    .single();

  assert(!dealErr && !!testDeal, 'Deal created for relational integrity test', dealErr?.message);

  // Check if deals exist for customer
  const { count: dealsCount } = await admin
    .from('deals')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', createdCust1.id);

  assert((dealsCount ?? 0) > 0, 'Customer has 1 associated deal');

  // Attempting hard delete on customer with deals must be rejected by foreign key constraint
  const { error: hardDeleteErr } = await admin
    .from('customers')
    .delete()
    .eq('id', createdCust1.id);

  assert(
    !!hardDeleteErr,
    'Hard delete of customer with deals is blocked by database constraint (ON DELETE RESTRICT)',
    hardDeleteErr?.message
  );

  // Cleanup test data
  if (testDeal) {
    await admin.from('deals').delete().eq('id', testDeal.id);
  }
  if (createdCust1) {
    await admin.from('customers').delete().eq('id', createdCust1.id);
  }
  if (createdCust2) {
    await admin.from('customers').delete().eq('id', createdCust2.id);
  }

  console.log('\n====================================================');
  console.log(`VERIFICATION SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('====================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
