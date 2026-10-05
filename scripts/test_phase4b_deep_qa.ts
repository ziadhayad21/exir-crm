// scripts/test_phase4b_deep_qa.ts
// Phase 4B: Deep QA & Adversarial Verification Suite
// Tests parameter tampering resistance, trigger storming & recursion guards,
// capacity invariants, concurrent completions, FIFO order, role isolation, and performance.

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  console.error('Missing Supabase environment variables in .env.local');
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function recordTest(suite: string, title: string, passed: boolean, details?: string) {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`  ✅ PASS: [${suite}] ${title}${details ? ` (${details})` : ''}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: [${suite}] ${title}${details ? ` - ${details}` : ''}`);
  }
}

let SALES_ROLE_ID: string;

async function ensureEmployee(email: string, fullName: string, roleId: string, roleName: string) {
  const { data: authUsers } = await admin.auth.admin.listUsers();
  let user = authUsers?.users?.find((u) => u.email === email);

  if (!user) {
    const { data: newUser, error } = await admin.auth.admin.createUser({
      email,
      password: 'Password123!',
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !newUser.user) throw new Error(`Failed to create auth user ${email}: ${error?.message}`);
    user = newUser.user;
  }

  let { data: emp } = await admin.from('employees').select('id').eq('auth_user_id', user.id).maybeSingle();

  if (!emp) {
    const { data: newEmp, error: empErr } = await admin
      .from('employees')
      .insert({
        auth_user_id: user.id,
        email,
        full_name: fullName,
        is_active: true,
        is_online: false,
      })
      .select('id')
      .single();

    if (empErr || !newEmp) throw new Error(`Failed to create employee ${email}: ${empErr?.message}`);
    emp = newEmp;
  }

  await admin.from('user_roles').delete().eq('employee_id', emp.id);
  const { error: roleErr } = await admin.from('user_roles').insert({
    employee_id: emp.id,
    role_id: roleId,
  });
  if (roleErr) throw new Error(`Failed to assign role: ${roleErr.message}`);

  return { id: emp.id, email, authUserId: user.id, name: fullName, roleName };
}

async function checkCapacityInvariant(empIds: string[], maxAllowed = 5) {
  let violations = 0;
  let maxObserved = 0;

  for (const empId of empIds) {
    const { count } = await admin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', empId)
      .eq('status', 'new');

    const activeCount = count ?? 0;
    if (activeCount > maxObserved) maxObserved = activeCount;
    if (activeCount > maxAllowed) {
      violations++;
    }
  }

  return { maxObserved, violations };
}

async function cleanDatabaseState() {
  await admin.from('employees').update({ is_online: false }).not('id', 'is', null);
  await admin.from('conversations').delete().not('id', 'is', null);
  await admin.from('leads').delete().not('id', 'is', null);
}

async function runDeepQaSuite() {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('🔥 PHASE 4B: DEEP QA & ADVERSARIAL VERIFICATION SUITE');
  console.log('══════════════════════════════════════════════════════════════════════\n');

  try {
    // 0. Setup Roles & Personas
    const { data: roles } = await admin.from('roles').select('id, name');
    SALES_ROLE_ID = roles?.find((r) => r.name === 'Sales')?.id ?? '';

    const ahmed = await ensureEmployee('ahmed.deepqa@elexir.test', 'Ahmed DeepQA', SALES_ROLE_ID, 'Sales');
    const mohamed = await ensureEmployee('mohamed.deepqa@elexir.test', 'Mohamed DeepQA', SALES_ROLE_ID, 'Sales');
    const ziad = await ensureEmployee('ziad.deepqa@elexir.test', 'Ziad DeepQA', SALES_ROLE_ID, 'Sales');

    const testSalesIds = [ahmed.id, mohamed.id, ziad.id];

    // Clean up test database state
    await cleanDatabaseState();

    // ────────────────────────────────────────────────────────────────
    // 1. PARAMETER TAMPERING SECURITY
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 1. RPC Parameter Tampering Security ---');
    await cleanDatabaseState();
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).eq('id', ahmed.id);

    // Bulk create 15 pending leads
    const tamperPayloads = Array.from({ length: 15 }, (_, i) => ({
      full_name: `Tamper Lead ${i + 1}`,
      phone: `+201099TAMPER${i + 1}`,
      status: 'new',
      assignment_source: 'unassigned',
    }));
    await admin.from('leads').insert(tamperPayloads).select('id');

    // Call process_pending_unassigned_leads with malicious p_batch_limit = 100
    await admin.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo', p_batch_limit: 100 });

    const inv1 = await checkCapacityInvariant(testSalesIds, 5);
    const { data: ahmedTamperLeads } = await admin.from('leads').select('id').eq('assigned_to', ahmed.id).eq('status', 'new');

    recordTest(
      'Parameter Tampering',
      'Passing p_batch_limit = 100 was strictly clamped to 5 (Ahmed active = 5)',
      ahmedTamperLeads?.length === 5 && inv1.violations === 0,
      `Observed active count: ${ahmedTamperLeads?.length}, Invariant violations: ${inv1.violations}`
    );

    // Call with p_batch_limit = -1
    await admin.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo', p_batch_limit: -1 });
    const inv1b = await checkCapacityInvariant(testSalesIds, 5);
    recordTest(
      'Parameter Tampering',
      'Passing p_batch_limit = -1 safely handled without crash or capacity leak',
      inv1b.violations === 0 && inv1b.maxObserved <= 5,
      `Max observed: ${inv1b.maxObserved}`
    );

    // ────────────────────────────────────────────────────────────────
    // 2. TRIGGER STORM & RECURSION GUARD
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 2. Trigger Storming & Recursion Guard ---');
    await cleanDatabaseState();
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).in('id', testSalesIds);

    // Bulk create 30 assigned new leads and 30 pending leads
    const stormAssignedPayloads = Array.from({ length: 30 }, (_, i) => ({
      full_name: `Storm Assigned Lead ${i}`,
      phone: `+201099STORM${i}`,
      status: 'new',
      assigned_to: testSalesIds[i % 3],
      assignment_source: 'automatic',
    }));
    const { data: stormAssignedLeads } = await admin.from('leads').insert(stormAssignedPayloads).select('id');
    const stormAssignedIds = stormAssignedLeads?.map((l) => l.id) || [];

    const stormPendingPayloads = Array.from({ length: 30 }, (_, i) => ({
      full_name: `Storm Pending Lead ${i}`,
      phone: `+201099STORMP${i}`,
      status: 'new',
      assignment_source: 'unassigned',
    }));
    await admin.from('leads').insert(stormPendingPayloads).select('id');

    // Trigger rapid updates: 30 new -> contacted status changes concurrently
    const updatePromises = stormAssignedIds.map((id) =>
      admin.from('leads').update({ status: 'contacted' }).eq('id', id)
    );

    const stormResults = await Promise.all(updatePromises);
    const stormErrors = stormResults.filter((r) => r.error);

    const inv2 = await checkCapacityInvariant(testSalesIds, 5);

    recordTest(
      'Trigger Storm',
      '30 rapid concurrent status updates executed cleanly with ZERO stack/recursion errors and zero capacity violations',
      stormErrors.length === 0 && inv2.violations === 0,
      `Errors: ${stormErrors.length}, Max observed active backlog: ${inv2.maxObserved}`
    );

    // ────────────────────────────────────────────────────────────────
    // 3. CONCURRENT MULTI-REP STATUS COMPLETION & REFILL
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 3. Concurrent Multi-Rep Status Completion & Refill ---');
    await cleanDatabaseState();
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).in('id', testSalesIds);

    // Bulk fill all 3 reps to capacity (5 leads each = 15 total)
    const capPayloads: Array<{ full_name: string; phone: string; status: string; assigned_to: string; assignment_source: string }> = [];
    for (const empId of testSalesIds) {
      for (let i = 1; i <= 5; i++) {
        capPayloads.push({
          full_name: `Cap Lead ${empId.slice(0, 4)} ${i}`,
          phone: `+201099CAP${empId.slice(0, 4)}${i}`,
          status: 'new',
          assigned_to: empId,
          assignment_source: 'automatic',
        });
      }
    }
    const { data: capLeads } = await admin.from('leads').insert(capPayloads).select('id');
    const capLeadIds = capLeads?.map((l) => l.id) || [];

    // Bulk create 50 pending leads
    const capPendingPayloads = Array.from({ length: 50 }, (_, i) => ({
      full_name: `Cap Pending ${i}`,
      phone: `+201099CAPP${i}`,
      status: 'new',
      assignment_source: 'unassigned',
    }));
    await admin.from('leads').insert(capPendingPayloads).select('id');

    // Ahmed completes 2, Mohamed completes 3, Ziad completes 1 (total 6 freed slots)
    const ahmedLeadsToComplete = capLeadIds.slice(0, 2);
    const mohamedLeadsToComplete = capLeadIds.slice(5, 8);
    const ziadLeadsToComplete = capLeadIds.slice(10, 11);

    await Promise.all([
      ...ahmedLeadsToComplete.map((id) => admin.from('leads').update({ status: 'contacted' }).eq('id', id)),
      ...mohamedLeadsToComplete.map((id) => admin.from('leads').update({ status: 'contacted' }).eq('id', id)),
      ...ziadLeadsToComplete.map((id) => admin.from('leads').update({ status: 'contacted' }).eq('id', id)),
    ]);

    const inv3 = await checkCapacityInvariant(testSalesIds, 5);

    const { data: ahmedCapPost } = await admin.from('leads').select('id').eq('assigned_to', ahmed.id).eq('status', 'new');
    const { data: mohamedCapPost } = await admin.from('leads').select('id').eq('assigned_to', mohamed.id).eq('status', 'new');
    const { data: ziadCapPost } = await admin.from('leads').select('id').eq('assigned_to', ziad.id).eq('status', 'new');

    recordTest(
      'Multi-Rep Refill',
      'Concurrent status completions refilled exactly up to capacity of 5 per rep (Ahmed: 5, Mohamed: 5, Ziad: 5)',
      ahmedCapPost?.length === 5 && mohamedCapPost?.length === 5 && ziadCapPost?.length === 5 && inv3.violations === 0,
      `Ahmed: ${ahmedCapPost?.length}, Mohamed: ${mohamedCapPost?.length}, Ziad: ${ziadCapPost?.length}, Violations: ${inv3.violations}`
    );

    // ────────────────────────────────────────────────────────────────
    // 4. MANUAL LEAD CREATION & REVERSE STATUS TRANSITIONS
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 4. Manual Assignment & Reverse Status Transitions ---');
    await cleanDatabaseState();
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).eq('id', ahmed.id);

    // Bulk insert 5 manual leads for Ahmed
    const manualPayloads = Array.from({ length: 5 }, (_, i) => ({
      full_name: `Manual Lead ${i + 1}`,
      phone: `+201099MANUAL${i + 1}`,
      status: 'new',
      assigned_to: ahmed.id,
      assignment_source: 'manual',
    }));
    const { data: insertedManualLeads } = await admin.from('leads').insert(manualPayloads).select('id');
    const manualLeadIds = insertedManualLeads?.map((l) => l.id) || [];

    // Bulk insert 5 pending leads
    const manualPendingPayloads = Array.from({ length: 5 }, (_, i) => ({
      full_name: `Manual Pending ${i + 1}`,
      phone: `+201099MANP${i + 1}`,
      status: 'new',
      assignment_source: 'unassigned',
    }));
    await admin.from('leads').insert(manualPendingPayloads);

    // Run pending processor: Ahmed has 5 active leads (manual), so automatic routing must skip Ahmed!
    const { data: manualDrain } = await admin.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo' });

    const { data: ahmedManualLeads } = await admin.from('leads').select('id').eq('assigned_to', ahmed.id).eq('status', 'new');

    recordTest(
      'Manual Assignment',
      'Manual leads count towards active backlog slot; automated routing skipped Ahmed when active = 5',
      manualDrain === 0 && ahmedManualLeads?.length === 5,
      `Drained: ${manualDrain}, Ahmed active: ${ahmedManualLeads?.length}`
    );

    // Reverse status transition: set 1 lead to contacted
    await admin.from('leads').update({ status: 'contacted' }).eq('id', manualLeadIds[0]);
    const { data: ahmedAfterContacted } = await admin.from('leads').select('id').eq('assigned_to', ahmed.id).eq('status', 'new');

    // Revert lead 0 back to new -> Ahmed has 6 (5 manual + 1 auto)
    await admin.from('leads').update({ status: 'new' }).eq('id', manualLeadIds[0]);
    const { data: ahmedAfterRevert } = await admin.from('leads').select('id').eq('assigned_to', ahmed.id).eq('status', 'new');

    // Attempt refill when Ahmed has 6 active leads
    const { data: drainOverCap } = await admin.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo' });

    recordTest(
      'Reverse Transition',
      'Reverting status to new re-consumed slot; automated routing correctly skipped rep with active = 6 (drained: 0)',
      ahmedAfterContacted?.length === 5 && ahmedAfterRevert?.length === 6 && drainOverCap === 0,
      `After contacted: ${ahmedAfterContacted?.length}, After revert: ${ahmedAfterRevert?.length}, Drain: ${drainOverCap}`
    );

    // ────────────────────────────────────────────────────────────────
    // 5. DAILY COUNT INTEGRITY (received_at vs assigned_at)
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 5. Daily Count Integrity (received_at vs assigned_at) ---');
    await cleanDatabaseState();
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).eq('id', ahmed.id);

    // Create lead received yesterday
    const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: yesterdayLead } = await admin.from('leads').insert({
      full_name: 'Yesterday Lead 4B',
      phone: '+201099YEST',
      status: 'new',
      assignment_source: 'unassigned',
      received_at: yesterdayDate,
    }).select('id').single();

    // Assign yesterday's lead today
    await admin.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo' });

    const { data: assignedYestLead } = await admin.from('leads').select('received_at, assigned_at, assigned_to').eq('id', yesterdayLead?.id).single();

    // Check today count query for Ahmed (should be 0 because received_at is yesterday!)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count: todayCountForAhmed } = await admin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', ahmed.id)
      .gte('received_at', todayStart.toISOString());

    recordTest(
      'Daily Count Integrity',
      'Assigning yesterday lead today did NOT increment today received count (received_at is immutable)',
      assignedYestLead?.assigned_to === ahmed.id && todayCountForAhmed === 0,
      `Assigned to: ${assignedYestLead?.assigned_to}, Today received count: ${todayCountForAhmed}`
    );

    // ────────────────────────────────────────────────────────────────
    // 6. STRESS & LOAD PERFORMANCE
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 6. Performance & Load Stress (100 Pending Leads) ---');
    await cleanDatabaseState();
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).in('id', testSalesIds);

    const stressPayloads = Array.from({ length: 100 }, (_, i) => ({
      full_name: `Stress Lead ${i + 1}`,
      phone: `+201099STRESS${i + 1}`,
      status: 'new',
      assignment_source: 'unassigned',
      received_at: new Date(Date.now() + (i + 1) * 10).toISOString(),
    }));

    const { data: insertedStressLeads } = await admin.from('leads').insert(stressPayloads).select('id');
    const stressLeadIds = insertedStressLeads?.map((l) => l.id) || [];

    const tStart = Date.now();
    const { data: stressDrain } = await admin.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo' });
    const tElapsed = Date.now() - tStart;

    const invStress = await checkCapacityInvariant(testSalesIds, 5);
    const { data: pendingStressRemaining } = await admin.from('leads').select('id').in('id', stressLeadIds).is('assigned_to', null);

    recordTest(
      'Performance Stress',
      `100 pending leads processed in ${tElapsed}ms (Drained: ${stressDrain}, Pending remaining: ${pendingStressRemaining?.length})`,
      stressDrain === 15 && pendingStressRemaining?.length === 85 && invStress.violations === 0 && tElapsed < 3000,
      `Time: ${tElapsed}ms, Violations: ${invStress.violations}`
    );

    // ────────────────────────────────────────────────────────────────
    // 7. FINAL DATA INTEGRITY AUDIT
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 7. Database Integrity & Audit Summary ---');
    const invFinal = await checkCapacityInvariant(testSalesIds, 5);
    recordTest('Data Integrity', 'Zero capacity violations across all sales employees', invFinal.violations === 0, `Max observed active backlog: ${invFinal.maxObserved}`);

    // Check orphan conversations (conversation.assigned_to != lead.assigned_to)
    const { data: orphanConvs } = await admin
      .from('conversations')
      .select('id, assigned_to, lead_id, leads(assigned_to)')
      .not('lead_id', 'is', null);

    let syncMismatches = 0;
    for (const c of orphanConvs || []) {
      const leadAssigned = (c.leads as unknown as { assigned_to: string | null })?.assigned_to ?? null;
      if (c.assigned_to !== leadAssigned) syncMismatches++;
    }

    recordTest('Data Integrity', 'Zero lead ↔ conversation assignment mismatches', syncMismatches === 0, `Sync mismatches found: ${syncMismatches}`);

    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log('📊 DEEP QA VERIFICATION SUMMARY');
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log(`Total Tests Run: ${totalTests}`);
    console.log(`Passed:          ${passedTests}`);
    console.log(`Failed:          ${failedTests}`);
    console.log(`Success Rate:    ${((passedTests / totalTests) * 100).toFixed(1)}%`);

    if (failedTests > 0) {
      console.error('\n❌ PHASE 4B DEEP QA FAILED');
      process.exit(1);
    } else {
      console.log('\n🎉 PHASE 4B DEEP QA: PASS');
    }
  } catch (err: unknown) {
    console.error('Fatal error during Deep QA execution:', err);
    process.exit(1);
  }
}

runDeepQaSuite();
