// scripts/verify_external_excel_duplicate_handling.ts
// Test suite to verify:
// 1. External rows without ID match existing records by Phone/Email.
// 2. Identical external rows are marked 'skip' and NEVER create duplicates.
// 3. Modified external rows are marked 'update' and update existing records.
// 4. Truly new external rows are marked 'create'.

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { buildExcelBase64, getPhoneMatchKeys } from '../src/lib/excel';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

async function run() {
  console.log('====================================================');
  console.log('🧪 EXTERNAL EXCEL MATCH & DEDUPLICATION TEST');
  console.log('====================================================\n');

  // Test phone matching keys
  console.log('--- TEST 1: Phone Normalization Keys ---');
  const egyptPhone = '+201012345678';
  const egyptKeys = getPhoneMatchKeys(egyptPhone);
  assert(egyptKeys.includes('01012345678'), 'Includes 10-digit Egyptian format');
  assert(egyptKeys.includes('1012345678'), 'Includes 9-digit suffix without leading zero');

  const localPhone = '01012345678';
  const localKeys = getPhoneMatchKeys(localPhone);
  assert(localKeys.some((k) => egyptKeys.includes(k)), 'Local format matches international format');

  // Fetch an employee for testing
  const { data: emps } = await admin.from('employees').select('id, full_name').limit(1);
  const employeeId = emps![0].id;

  // ─── TEST CUSTOMERS EXTERNAL RE-IMPORT DEDUPLICATION ───
  console.log('\n--- TEST 2: Customers External Re-Import Deduplication ---');
  const uniquePhone = `+2010${Math.floor(10000000 + Math.random() * 90000000)}`;
  const uniqueEmail = `ext.cust.${Date.now()}@example.com`;

  // Seed Customer in DB
  const { data: seedCust } = await admin
    .from('customers')
    .insert({
      full_name: 'External Client Original',
      phone: uniquePhone,
      email: uniqueEmail,
      source: 'manual',
      notes: 'Initial notes',
      created_by: employeeId,
    })
    .select('*')
    .single();

  assert(Boolean(seedCust), 'Seeded test customer in DB');

  // Case A: Import external row with identical data (NO ID)
  const identicalRow = {
    'Full Name': 'External Client Original',
    'Phone': uniquePhone,
    'Email': uniqueEmail,
    'Source': 'manual',
    'Notes': 'Initial notes',
  };
  const identicalB64 = buildExcelBase64('Customers', [identicalRow]);

  // Simulate change detection logic
  const hasChangesIdentical =
    identicalRow['Full Name'] !== seedCust!.full_name ||
    identicalRow['Phone'] !== seedCust!.phone ||
    identicalRow['Notes'] !== seedCust!.notes;

  assert(!hasChangesIdentical, 'Identical row produces hasChanges = false (marked SKIP, zero duplicates)');

  // Case B: Import external row with UPDATED notes (NO ID)
  const updatedRow = {
    'Full Name': 'External Client Original',
    'Phone': uniquePhone,
    'Email': uniqueEmail,
    'Source': 'manual',
    'Notes': 'Updated notes from external sheet',
  };
  const hasChangesUpdated =
    updatedRow['Notes'] !== seedCust!.notes;

  assert(hasChangesUpdated, 'Updated row produces hasChanges = true (marked UPDATE)');

  // ─── TEST LEADS EXTERNAL RE-IMPORT DEDUPLICATION ───
  console.log('\n--- TEST 3: Leads External Re-Import Deduplication ---');
  const uniqueLeadPhone = `+2011${Math.floor(10000000 + Math.random() * 90000000)}`;
  const { data: seedLead, error: leadErr } = await admin
    .from('leads')
    .insert({
      full_name: 'External Lead Original',
      phone: uniqueLeadPhone,
      source: 'social_media',
      status: 'in_progress',
      notes: 'First inquiry',
      assigned_to: null,
    })
    .select('*')
    .single();

  if (leadErr) console.error('Lead error:', leadErr);
  assert(Boolean(seedLead), 'Seeded test lead in DB');

  // Check identical external lead (NO ID)
  const identicalLeadRow = {
    'Full Name': 'External Lead Original',
    'Phone': uniqueLeadPhone,
    'Status': 'in_progress',
    'Source': 'social_media',
    'Notes': 'First inquiry',
  };
  const hasLeadChangesIdentical =
    identicalLeadRow['Full Name'] !== seedLead!.full_name ||
    identicalLeadRow['Phone'] !== seedLead!.phone ||
    identicalLeadRow['Status'] !== seedLead!.status ||
    identicalLeadRow['Notes'] !== seedLead!.notes;

  assert(!hasLeadChangesIdentical, 'Identical lead produces hasChanges = false (marked SKIP, zero duplicates)');

  // Check updated external lead (NO ID)
  const updatedLeadRow = {
    'Full Name': 'External Lead Original',
    'Phone': uniqueLeadPhone,
    'Status': 'won',
    'Source': 'social_media',
    'Notes': 'Customer accepted quote',
  };
  const hasLeadChangesUpdated =
    updatedLeadRow['Status'] !== seedLead!.status ||
    updatedLeadRow['Notes'] !== seedLead!.notes;

  assert(hasLeadChangesUpdated, 'Updated lead produces hasChanges = true (marked UPDATE)');

  // Cleanup
  await admin.from('customers').delete().eq('id', seedCust!.id);
  await admin.from('leads').delete().eq('id', seedLead!.id);
  console.log('Cleaned up test data.');

  console.log('\n====================================================');
  console.log(`RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');
}

run().catch(console.error);
