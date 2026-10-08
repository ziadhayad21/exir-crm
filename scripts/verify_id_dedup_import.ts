// scripts/verify_id_dedup_import.ts
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Mock server-only, next/headers, next/cache, and @/lib/auth for standalone script runner
let primaryEmp: any = null;

const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === 'server-only') return {};
  if (id === 'next/headers') {
    return {
      cookies: async () => ({
        get: () => ({ value: 'test-token' }),
        getAll: () => [],
      }),
    };
  }
  if (id === 'next/cache') {
    return {
      revalidatePath: () => {},
    };
  }
  if (id === '@/lib/auth' || id.endsWith('/auth') || id.endsWith('/auth/index') || id.includes('lib/auth')) {
    return {
      requirePermission: async () => ({
        user: { id: primaryEmp?.id || 'emp-1', email: primaryEmp?.email || 'admin@exir.com' },
        employee: { id: primaryEmp?.id || 'emp-1', full_name: primaryEmp?.full_name || 'Admin', email: primaryEmp?.email || 'admin@exir.com', is_active: true },
        roles: ['admin'],
        permissions: ['crm.customers.write', 'crm.customers.read_all', 'crm.leads.write', 'crm.leads.read_all'],
      }),
      requireAnyPermission: async () => ({
        user: { id: primaryEmp?.id || 'emp-1', email: primaryEmp?.email || 'admin@exir.com' },
        employee: { id: primaryEmp?.id || 'emp-1', full_name: primaryEmp?.full_name || 'Admin', email: primaryEmp?.email || 'admin@exir.com', is_active: true },
        roles: ['admin'],
        permissions: ['crm.customers.write', 'crm.customers.read_all', 'crm.leads.write', 'crm.leads.read_all'],
      }),
      hasPermission: () => true,
      hasAnyPermission: () => true,
    };
  }
  return origRequire.apply(this, arguments);
};

import { createClient } from '@supabase/supabase-js';
import { buildExcelBase64, normalizeToUuid } from '../src/lib/excel';

async function main() {
  console.log('--- STARTING ID DEDUPLICATION & ARBITRARY ID TESTS ---');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const directAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: emps } = await directAdmin.from('employees').select('id, full_name, email').eq('is_active', true).limit(1);
  primaryEmp = emps![0];

  const {
    validateCustomersImportExcel,
    executeCustomersImportExcel,
    validateLeadsImportExcel,
    executeLeadsImportExcel,
  } = await import('../src/app/(dashboard)/crm/excel-actions');

  // Test 0: Test normalizeToUuid
  const u1 = normalizeToUuid(1);
  const u1_again = normalizeToUuid('1');
  const uText = normalizeToUuid('LD-01');
  const uText_again = normalizeToUuid('ld-01');
  const realUuid = '847bb194-e341-4770-b3e1-320d75508c90';
  const uReal = normalizeToUuid(realUuid);

  console.log('normalizeToUuid(1):', u1);
  console.log('normalizeToUuid("1"):', u1_again);
  if (u1 !== u1_again) throw new Error('normalizeToUuid must be deterministic for 1 and "1"');
  if (uText !== uText_again) throw new Error('normalizeToUuid must be case-insensitive for text');
  if (uReal !== realUuid.toLowerCase()) throw new Error('normalizeToUuid must preserve valid UUIDs');
  console.log('✅ normalizeToUuid tests passed!');

  // Test 1: Customer Import with arbitrary IDs ('1' and '2')
  console.log('\n--- TEST 1: Customer import with arbitrary IDs (1 and 2) ---');
  const custSheet = [
    { 'ID': 1, 'Full Name': 'Customer One', 'Phone': '01011111111', 'Source': 'Manual', 'Notes': 'Initial notes 1' },
    { 'ID': 2, 'Full Name': 'Customer Two', 'Phone': '01022222222', 'Source': 'Manual', 'Notes': 'Initial notes 2' },
  ];
  const b64Cust = buildExcelBase64('Customers', custSheet);
  const valCust1 = await validateCustomersImportExcel(b64Cust);
  console.log('Customer First Validation Summary:', valCust1.summary);
  if (valCust1.summary.createCount !== 2 || valCust1.summary.errorCount !== 0) {
    throw new Error('Expected 2 create, 0 errors for first import');
  }

  const execCust1 = await executeCustomersImportExcel(valCust1.rows);
  console.log('Customer First Execution Result:', execCust1.summary);
  if (execCust1.summary.created !== 2 || execCust1.summary.errors !== 0) {
    throw new Error('Expected 2 created customers');
  }

  // Re-importing the same file with IDs 1 and 2 (with an update on notes)
  console.log('\n--- TEST 2: Re-importing Customer file with same IDs (1 and 2) ---');
  const custSheetUpdate = [
    { 'ID': 1, 'Full Name': 'Customer One Updated', 'Phone': '01011111111', 'Source': 'Manual', 'Notes': 'Updated notes 1' },
    { 'ID': 2, 'Full Name': 'Customer Two Updated', 'Phone': '01022222222', 'Source': 'Manual', 'Notes': 'Updated notes 2' },
  ];
  const b64CustUpdate = buildExcelBase64('Customers', custSheetUpdate);
  const valCust2 = await validateCustomersImportExcel(b64CustUpdate);
  console.log('Customer Second Validation Summary:', valCust2.summary);
  if (valCust2.summary.updateCount !== 2 || valCust2.summary.createCount !== 0) {
    throw new Error(`Expected 2 update, 0 create for second import. Got create=${valCust2.summary.createCount}, update=${valCust2.summary.updateCount}`);
  }

  const execCust2 = await executeCustomersImportExcel(valCust2.rows);
  console.log('Customer Second Execution Result:', execCust2.summary);
  if (execCust2.summary.updated !== 2 || execCust2.summary.created !== 0) {
    throw new Error('Expected 2 updated customers, 0 created');
  }

  // Test 3: Duplicate ID repeated within the same Excel file
  console.log('\n--- TEST 3: Duplicate ID repeated within same file ---');
  const duplicateIdSheet = [
    { 'ID': 99, 'Full Name': 'Customer 99 First', 'Phone': '01099999991', 'Source': 'Manual' },
    { 'ID': 99, 'Full Name': 'Customer 99 Duplicate', 'Phone': '01099999992', 'Source': 'Manual' },
  ];
  const b64Dup = buildExcelBase64('Customers', duplicateIdSheet);
  const valDup = await validateCustomersImportExcel(b64Dup);
  console.log('Duplicate ID File Validation Summary:', valDup.summary);
  if (valDup.summary.createCount !== 1 || valDup.summary.skipCount !== 1) {
    throw new Error(`Expected 1 create, 1 skip for duplicate ID within file. Got: ${JSON.stringify(valDup.summary)}`);
  }

  // Test 4: Constant/Identical Data with different IDs ("الداتا وارد تبقي ثابته المهم id ميتكررش الباقي عادي")
  console.log('\n--- TEST 4: Constant/identical phone & data with different IDs ---');
  const identicalDataSheet = [
    { 'ID': 'LD-101', 'Full Name': 'Same Contact Lead 1', 'Phone': '01033333333', 'Status': 'In Progress' },
    { 'ID': 'LD-102', 'Full Name': 'Same Contact Lead 2', 'Phone': '01033333333', 'Status': 'In Progress' }, // same phone!
    { 'Full Name': 'Same Contact Lead 3 (No ID)', 'Phone': '01033333333', 'Status': 'In Progress' }, // same phone, new ID!
  ];
  const b64LeadsIdentical = buildExcelBase64('Leads', identicalDataSheet);
  const valLeads = await validateLeadsImportExcel(b64LeadsIdentical);
  console.log('Identical Data Leads Validation Summary:', valLeads.summary);
  if (valLeads.summary.createCount !== 3 || valLeads.summary.skipCount !== 0 || valLeads.summary.errorCount !== 0) {
    throw new Error(`Expected all 3 to be created because IDs are unique or new. Got: ${JSON.stringify(valLeads.summary)}`);
  }

  const execLeads = await executeLeadsImportExcel(valLeads.rows);
  console.log('Identical Data Leads Execution Result:', execLeads.summary);
  if (execLeads.summary.created !== 3 || execLeads.summary.errors !== 0) {
    throw new Error('Expected 3 created leads');
  }

  // Re-importing identicalDataSheet to ensure LD-101 and LD-102 update, while row 3 creates again
  const valLeadsReimport = await validateLeadsImportExcel(b64LeadsIdentical);
  console.log('Leads Re-import Summary:', valLeadsReimport.summary);
  if (valLeadsReimport.summary.updateCount !== 2 || valLeadsReimport.summary.createCount !== 1) {
    throw new Error(`Expected 2 update (LD-101, LD-102) and 1 create (No ID row). Got: ${JSON.stringify(valLeadsReimport.summary)}`);
  }

  console.log('\n========================================');
  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('========================================');
}

main().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
