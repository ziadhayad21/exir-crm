// scripts/test_lead_module_visibility.ts
// Test suite for Lead Module Visibility & RLS Enforcement:
// 1. Ahmed sees only Ahmed's Leads.
// 2. Mohamed sees only Mohamed's Leads.
// 3. Admin sees all Leads (Ahmed's, Mohamed's, unassigned).
// 4. Cross-employee direct database/API access is strictly denied (SELECT & UPDATE).

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const admin = createClient(supabaseUrl, serviceRoleKey);

async function runLeadVisibilityTests() {
  console.log('========================================================================');
  console.log('🔒 LEAD MODULE VISIBILITY & RLS ENFORCEMENT TEST SUITE');
  console.log('========================================================================\n');

  // 1. Fetch test users
  const { data: emps, error: empErr } = await admin
    .from('employees')
    .select('id, auth_user_id, email, full_name')
    .in('email', ['sales1@gmail.com', 'sales2@gmail.com', 'admin@elexir.test']);

  if (empErr || !emps || emps.length < 3) {
    throw new Error(`Failed to find required employees: ${JSON.stringify(empErr || emps)}`);
  }

  const ahmedEmp = emps.find((e) => e.email === 'sales1@gmail.com')!;
  const mohamedEmp = emps.find((e) => e.email === 'sales2@gmail.com')!;
  const adminEmp = emps.find((e) => e.email === 'admin@elexir.test')!;

  console.log(`Ahmed (Sales 1):   ${ahmedEmp.full_name} (${ahmedEmp.id})`);
  console.log(`Mohamed (Sales 2): ${mohamedEmp.full_name} (${mohamedEmp.id})`);
  console.log(`Admin:            ${adminEmp.full_name} (${adminEmp.id})\n`);

  // Use standard passwords for testing
  const SALES_PASSWORD = 'Sales123!';
  const ADMIN_PASSWORD = 'Admin123!';
  await admin.auth.admin.updateUserById(ahmedEmp.auth_user_id, { password: SALES_PASSWORD });
  await admin.auth.admin.updateUserById(mohamedEmp.auth_user_id, { password: SALES_PASSWORD });
  await admin.auth.admin.updateUserById(adminEmp.auth_user_id, { password: ADMIN_PASSWORD });

  // 2. Clean previous test leads
  const testTag = `vis_test_${Date.now()}`;
  const cleanupLeadIds: string[] = [];

  try {
    // 3. Create test leads:
    //    - 2 assigned to Ahmed
    //    - 2 assigned to Mohamed
    //    - 1 unassigned
    console.log('--- Creating Controlled Test Leads ---');

    const { data: ahmedLead1, error: errA1 } = await admin.from('leads').insert({
      full_name: `Ahmed Lead 1 (${testTag})`,
      email: `ahmed_lead1_${testTag}@example.com`,
      status: 'in_progress',
      source: 'manual',
      assigned_to: ahmedEmp.id,
      assignment_source: 'manual',
    }).select('id, full_name, assigned_to').single();
    if (errA1 || !ahmedLead1) throw new Error(`Failed to create Ahmed Lead 1: ${JSON.stringify(errA1)}`);
    cleanupLeadIds.push(ahmedLead1.id);

    const { data: ahmedLead2, error: errA2 } = await admin.from('leads').insert({
      full_name: `Ahmed Lead 2 (${testTag})`,
      email: `ahmed_lead2_${testTag}@example.com`,
      status: 'in_progress',
      source: 'manual',
      assigned_to: ahmedEmp.id,
      assignment_source: 'manual',
    }).select('id, full_name, assigned_to').single();
    if (errA2 || !ahmedLead2) throw new Error(`Failed to create Ahmed Lead 2: ${JSON.stringify(errA2)}`);
    cleanupLeadIds.push(ahmedLead2.id);

    const { data: mohamedLead1, error: errM1 } = await admin.from('leads').insert({
      full_name: `Mohamed Lead 1 (${testTag})`,
      email: `mohamed_lead1_${testTag}@example.com`,
      status: 'in_progress',
      source: 'manual',
      assigned_to: mohamedEmp.id,
      assignment_source: 'manual',
    }).select('id, full_name, assigned_to').single();
    if (errM1 || !mohamedLead1) throw new Error(`Failed to create Mohamed Lead 1: ${JSON.stringify(errM1)}`);
    cleanupLeadIds.push(mohamedLead1.id);

    const { data: mohamedLead2, error: errM2 } = await admin.from('leads').insert({
      full_name: `Mohamed Lead 2 (${testTag})`,
      email: `mohamed_lead2_${testTag}@example.com`,
      status: 'in_progress',
      source: 'manual',
      assigned_to: mohamedEmp.id,
      assignment_source: 'manual',
    }).select('id, full_name, assigned_to').single();
    if (errM2 || !mohamedLead2) throw new Error(`Failed to create Mohamed Lead 2: ${JSON.stringify(errM2)}`);
    cleanupLeadIds.push(mohamedLead2.id);

    const { data: unassignedLead, error: errU } = await admin.from('leads').insert({
      full_name: `Unassigned Lead (${testTag})`,
      email: `unassigned_${testTag}@example.com`,
      status: 'in_progress',
      source: 'manual',
      assigned_to: null,
      assignment_source: 'unassigned',
    }).select('id, full_name, assigned_to').single();
    if (errU || !unassignedLead) throw new Error(`Failed to create Unassigned Lead: ${JSON.stringify(errU)}`);
    cleanupLeadIds.push(unassignedLead.id);

    console.log(`  Created Ahmed Leads:   ${ahmedLead1.id}, ${ahmedLead2.id}`);
    console.log(`  Created Mohamed Leads: ${mohamedLead1.id}, ${mohamedLead2.id}`);
    console.log(`  Created Unassigned:    ${unassignedLead.id}\n`);

    // 4. Authenticate client for Ahmed
    console.log('--- TEST 1: Ahmed Visibility ---');
    const ahmedClient = createClient(supabaseUrl, anonKey);
    const { error: ahmedLoginErr } = await ahmedClient.auth.signInWithPassword({
      email: ahmedEmp.email,
      password: SALES_PASSWORD,
    });
    if (ahmedLoginErr) throw new Error(`Ahmed login failed: ${ahmedLoginErr.message}`);

    const { data: ahmedVisibleLeads, error: ahmedQueryErr } = await ahmedClient
      .from('leads')
      .select('id, full_name, assigned_to')
      .in('id', cleanupLeadIds);

    if (ahmedQueryErr) throw new Error(`Ahmed query failed: ${ahmedQueryErr.message}`);

    console.log(`  Ahmed queried test leads. Count returned: ${ahmedVisibleLeads.length}`);
    const ahmedSawAhmed1 = ahmedVisibleLeads.some((l) => l.id === ahmedLead1.id);
    const ahmedSawAhmed2 = ahmedVisibleLeads.some((l) => l.id === ahmedLead2.id);
    const ahmedSawMohamed = ahmedVisibleLeads.some((l) => l.assigned_to === mohamedEmp.id);
    const ahmedSawUnassigned = ahmedVisibleLeads.some((l) => l.id === unassignedLead.id);

    if (!ahmedSawAhmed1 || !ahmedSawAhmed2) {
      throw new Error(`Ahmed failed to see his own assigned leads!`);
    }
    if (ahmedSawMohamed) {
      throw new Error(`SECURITY VIOLATION: Ahmed saw Mohamed's assigned leads!`);
    }
    if (ahmedSawUnassigned) {
      throw new Error(`SECURITY VIOLATION: Ahmed saw unassigned leads!`);
    }
    console.log('  ✅ PASSED: Ahmed sees ONLY Ahmed\'s leads (2/2 own, 0/2 Mohamed, 0/1 unassigned).\n');

    // 5. Authenticate client for Mohamed
    console.log('--- TEST 2: Mohamed Visibility ---');
    const mohamedClient = createClient(supabaseUrl, anonKey);
    const { error: mohamedLoginErr } = await mohamedClient.auth.signInWithPassword({
      email: mohamedEmp.email,
      password: SALES_PASSWORD,
    });
    if (mohamedLoginErr) throw new Error(`Mohamed login failed: ${mohamedLoginErr.message}`);

    const { data: mohamedVisibleLeads, error: mohamedQueryErr } = await mohamedClient
      .from('leads')
      .select('id, full_name, assigned_to')
      .in('id', cleanupLeadIds);

    if (mohamedQueryErr) throw new Error(`Mohamed query failed: ${mohamedQueryErr.message}`);

    console.log(`  Mohamed queried test leads. Count returned: ${mohamedVisibleLeads.length}`);
    const mohamedSawMohamed1 = mohamedVisibleLeads.some((l) => l.id === mohamedLead1.id);
    const mohamedSawMohamed2 = mohamedVisibleLeads.some((l) => l.id === mohamedLead2.id);
    const mohamedSawAhmed = mohamedVisibleLeads.some((l) => l.assigned_to === ahmedEmp.id);
    const mohamedSawUnassigned = mohamedVisibleLeads.some((l) => l.id === unassignedLead.id);

    if (!mohamedSawMohamed1 || !mohamedSawMohamed2) {
      throw new Error(`Mohamed failed to see his own assigned leads!`);
    }
    if (mohamedSawAhmed) {
      throw new Error(`SECURITY VIOLATION: Mohamed saw Ahmed's assigned leads!`);
    }
    if (mohamedSawUnassigned) {
      throw new Error(`SECURITY VIOLATION: Mohamed saw unassigned leads!`);
    }
    console.log('  ✅ PASSED: Mohamed sees ONLY Mohamed\'s leads (2/2 own, 0/2 Ahmed, 0/1 unassigned).\n');

    // 6. Authenticate client for Admin
    console.log('--- TEST 3: Admin Visibility ---');
    const adminClient = createClient(supabaseUrl, anonKey);
    const { error: adminLoginErr } = await adminClient.auth.signInWithPassword({
      email: adminEmp.email,
      password: ADMIN_PASSWORD,
    });
    if (adminLoginErr) throw new Error(`Admin login failed: ${adminLoginErr.message}`);

    const { data: adminVisibleLeads, error: adminQueryErr } = await adminClient
      .from('leads')
      .select('id, full_name, assigned_to')
      .in('id', cleanupLeadIds);

    if (adminQueryErr) throw new Error(`Admin query failed: ${adminQueryErr.message}`);

    console.log(`  Admin queried test leads. Count returned: ${adminVisibleLeads.length}`);
    if (adminVisibleLeads.length !== 5) {
      throw new Error(`Admin expected to see all 5 test leads, but saw ${adminVisibleLeads.length}!`);
    }
    console.log('  ✅ PASSED: Admin sees ALL leads (Ahmed\'s, Mohamed\'s, and unassigned leads: 5/5).\n');

    // 7. Cross-Employee Direct Database / API Access Prevention
    console.log('--- TEST 4: Cross-Employee Direct Access Denial ---');

    // 4.1 Mohamed attempts direct SELECT on Ahmed's lead by ID
    const { data: mohamedDirectSelect, error: mSelectErr } = await mohamedClient
      .from('leads')
      .select('id, full_name')
      .eq('id', ahmedLead1.id);

    if (mSelectErr) throw new Error(`Unexpected error on direct select: ${mSelectErr.message}`);
    if (mohamedDirectSelect && mohamedDirectSelect.length > 0) {
      throw new Error(`SECURITY VIOLATION: Mohamed bypassed RLS to directly SELECT Ahmed's lead!`);
    }
    console.log('  ✅ Subtest 4.1 PASSED: Mohamed direct SELECT of Ahmed\'s lead returned 0 rows.');

    // 4.2 Mohamed attempts direct UPDATE on Ahmed's lead by ID
    const { data: mohamedDirectUpdate } = await mohamedClient
      .from('leads')
      .update({ notes: 'Compromised by Mohamed' })
      .eq('id', ahmedLead1.id)
      .select();

    if (mohamedDirectUpdate && mohamedDirectUpdate.length > 0) {
      throw new Error(`SECURITY VIOLATION: Mohamed bypassed RLS to directly UPDATE Ahmed's lead!`);
    }
    console.log('  ✅ Subtest 4.2 PASSED: Mohamed direct UPDATE on Ahmed\'s lead returned 0 rows modified.');

    // 4.3 Ahmed attempts direct SELECT on Mohamed's lead by ID
    const { data: ahmedDirectSelect, error: aSelectErr } = await ahmedClient
      .from('leads')
      .select('id, full_name')
      .eq('id', mohamedLead1.id);

    if (aSelectErr) throw new Error(`Unexpected error on direct select: ${aSelectErr.message}`);
    if (ahmedDirectSelect && ahmedDirectSelect.length > 0) {
      throw new Error(`SECURITY VIOLATION: Ahmed bypassed RLS to directly SELECT Mohamed's lead!`);
    }
    console.log('  ✅ Subtest 4.3 PASSED: Ahmed direct SELECT of Mohamed\'s lead returned 0 rows.');

    // 4.4 Ahmed attempts direct UPDATE on Mohamed's lead by ID
    const { data: ahmedDirectUpdate } = await ahmedClient
      .from('leads')
      .update({ notes: 'Compromised by Ahmed' })
      .eq('id', mohamedLead1.id)
      .select();

    if (ahmedDirectUpdate && ahmedDirectUpdate.length > 0) {
      throw new Error(`SECURITY VIOLATION: Ahmed bypassed RLS to directly UPDATE Mohamed's lead!`);
    }
    console.log('  ✅ Subtest 4.4 PASSED: Ahmed direct UPDATE on Mohamed\'s lead returned 0 rows modified.');

    console.log('\n========================================================================');
    console.log('🎉 ALL LEAD VISIBILITY & SECURITY TESTS PASSED 100%!');
    console.log('========================================================================\n');
  } finally {
    // Cleanup
    if (cleanupLeadIds.length > 0) {
      await admin.from('leads').delete().in('id', cleanupLeadIds);
    }
  }
}

runLeadVisibilityTests().catch((err) => {
  console.error('\n❌ LEAD VISIBILITY TEST FAILED:', err);
  process.exit(1);
});
