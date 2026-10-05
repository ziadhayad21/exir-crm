// scripts/test_phase4b_batching.ts
// Phase 4B: Comprehensive Automated Verification Suite
// Tests smart backlog batching (BACKLOG_BATCH_LIMIT = 5), automatic refills,
// capacity constraints, concurrency safety, role isolation, and security.

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { BACKLOG_BATCH_LIMIT } from '../src/lib/constants';

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

async function cleanDatabaseState() {
  await admin.from('employees').update({ is_online: false }).not('id', 'is', null);
  await admin.from('conversations').delete().not('id', 'is', null);
  await admin.from('leads').delete().not('id', 'is', null);
}

async function runPhase4bTestSuite() {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('🚀 PHASE 4B: SMART BACKLOG BATCHING & ASSIGNMENT VERIFICATION SUITE');
  console.log('══════════════════════════════════════════════════════════════════════\n');

  try {
    // 0. Setup Roles & Personas
    const { data: roles } = await admin.from('roles').select('id, name');
    SALES_ROLE_ID = roles?.find((r) => r.name === 'Sales')?.id ?? '';

    const ahmed = await ensureEmployee('ahmed.sales4b@elexir.test', 'Ahmed Sales 4B', SALES_ROLE_ID, 'Sales');
    const mohamed = await ensureEmployee('mohamed.sales4b@elexir.test', 'Mohamed Sales 4B', SALES_ROLE_ID, 'Sales');
    const ziad = await ensureEmployee('ziad.sales4b@elexir.test', 'Ziad Sales 4B', SALES_ROLE_ID, 'Sales');

    const testSalesIds = [ahmed.id, mohamed.id, ziad.id];

    await cleanDatabaseState();

    // ────────────────────────────────────────────────────────────────
    // TEST A: Basic Batching (20 pending + 1 online rep -> max 5 assigned)
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test A: Basic Batching (20 pending, 1 rep online) ---');
    await cleanDatabaseState();
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).eq('id', ahmed.id);

    // Create 20 pending unassigned leads
    const batchALeadPayloads = Array.from({ length: 20 }, (_, i) => ({
      full_name: `Batch A Lead ${i + 1}`,
      phone: `+20104B${100000 + i + 1}`,
      status: 'new',
      assignment_source: 'unassigned',
      received_at: new Date(Date.now() + (i + 1) * 1000).toISOString(),
    }));
    const { data: insertedALeads } = await admin.from('leads').insert(batchALeadPayloads).select('id');
    const batchALeadIds = insertedALeads?.map((l) => l.id) || [];

    // Process pending backlog
    const { data: drainedA } = await admin.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo', p_batch_limit: BACKLOG_BATCH_LIMIT });

    const { data: ahmedLeadsA } = await admin
      .from('leads')
      .select('id')
      .eq('assigned_to', ahmed.id)
      .eq('status', 'new');

    const { data: pendingLeadsA } = await admin
      .from('leads')
      .select('id')
      .in('id', batchALeadIds)
      .is('assigned_to', null);

    recordTest(
      'Basic Batching',
      `Ahmed received exactly 5 leads out of 20 (drained: ${drainedA})`,
      ahmedLeadsA?.length === BACKLOG_BATCH_LIMIT && pendingLeadsA?.length === 15 && drainedA === 5,
      `Ahmed assigned: ${ahmedLeadsA?.length}, Pending remaining: ${pendingLeadsA?.length}`
    );

    // ────────────────────────────────────────────────────────────────
    // TEST B: Refill (Status transition new -> contacted frees capacity)
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test B: Refill on Status Transition ---');
    // Change 2 of Ahmed's leads to contacted
    const leadsToUpdate = ahmedLeadsA?.slice(0, 2).map((l) => l.id) || [];
    for (const lid of leadsToUpdate) {
      await admin.from('leads').update({ status: 'contacted' }).eq('id', lid);
    }

    const { data: ahmedActiveB } = await admin
      .from('leads')
      .select('id')
      .eq('assigned_to', ahmed.id)
      .eq('status', 'new');

    const { data: ahmedTotalB } = await admin
      .from('leads')
      .select('id')
      .eq('assigned_to', ahmed.id);

    const { data: pendingLeadsB } = await admin
      .from('leads')
      .select('id')
      .in('id', batchALeadIds)
      .is('assigned_to', null);

    recordTest(
      'Refill Mechanics',
      'Contacted status freed capacity and refilled Ahmed back to 5 active leads',
      ahmedActiveB?.length === BACKLOG_BATCH_LIMIT && ahmedTotalB?.length === 7 && pendingLeadsB?.length === 13,
      `Active (new): ${ahmedActiveB?.length}, Total owned: ${ahmedTotalB?.length}, Remaining pending: ${pendingLeadsB?.length}`
    );

    // ────────────────────────────────────────────────────────────────
    // TEST C: Status Slot Occupancy Verification
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test C: Status Slot Occupancy (new = active, others = completed) ---');
    const { data: ahmedNewLeadsC } = await admin
      .from('leads')
      .select('id')
      .eq('assigned_to', ahmed.id)
      .eq('status', 'new')
      .limit(2);

    if (ahmedNewLeadsC && ahmedNewLeadsC.length >= 2) {
      await admin.from('leads').update({ status: 'converted' }).eq('id', ahmedNewLeadsC[0].id);
      await admin.from('leads').update({ status: 'lost' }).eq('id', ahmedNewLeadsC[1].id);
    }

    const { data: ahmedActiveC } = await admin
      .from('leads')
      .select('id')
      .eq('assigned_to', ahmed.id)
      .eq('status', 'new');

    recordTest(
      'Status Occupancy',
      'Converted and Lost statuses immediately freed slots and triggered refill back to 5 active leads',
      ahmedActiveC?.length === BACKLOG_BATCH_LIMIT,
      `Active (new) count: ${ahmedActiveC?.length}`
    );

    // ────────────────────────────────────────────────────────────────
    // TEST D: Multiple Employees Capacity & Fairness
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test D: Multiple Employees Capacity & Fairness ---');
    await cleanDatabaseState();
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).in('id', testSalesIds);

    const batchDLeadPayloads = Array.from({ length: 20 }, (_, i) => ({
      full_name: `Batch D Lead ${i + 1}`,
      phone: `+20104D${100000 + i + 1}`,
      status: 'new',
      assignment_source: 'unassigned',
      received_at: new Date(Date.now() + (i + 1) * 1000).toISOString(),
    }));
    const { data: insertedDLeads } = await admin.from('leads').insert(batchDLeadPayloads).select('id');
    const batchDLeadIds = insertedDLeads?.map((l) => l.id) || [];

    await admin.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo', p_batch_limit: BACKLOG_BATCH_LIMIT });

    const { data: ahmedActiveD } = await admin.from('leads').select('id').eq('assigned_to', ahmed.id).eq('status', 'new');
    const { data: mohamedActiveD } = await admin.from('leads').select('id').eq('assigned_to', mohamed.id).eq('status', 'new');
    const { data: ziadActiveD } = await admin.from('leads').select('id').eq('assigned_to', ziad.id).eq('status', 'new');
    const { data: pendingD } = await admin.from('leads').select('id').in('id', batchDLeadIds).is('assigned_to', null);

    recordTest(
      'Multi-Rep Fairness',
      '3 online reps receive max 5 active leads each (total 15), leaving 5 pending',
      ahmedActiveD?.length === 5 && mohamedActiveD?.length === 5 && ziadActiveD?.length === 5 && pendingD?.length === 5,
      `Ahmed: ${ahmedActiveD?.length}, Mohamed: ${mohamedActiveD?.length}, Ziad: ${ziadActiveD?.length}, Pending: ${pendingD?.length}`
    );

    // ────────────────────────────────────────────────────────────────
    // TEST E & F: Employee Joins Later & Sticky Assignment
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test E & F: Employee Joins Later & Sticky Assignment ---');
    const { data: mohamedLeadsF } = await admin.from('leads').select('id').eq('assigned_to', mohamed.id).eq('status', 'new').limit(2);
    if (mohamedLeadsF && mohamedLeadsF.length >= 2) {
      await admin.from('leads').update({ status: 'contacted' }).eq('id', mohamedLeadsF[0].id);
      await admin.from('leads').update({ status: 'contacted' }).eq('id', mohamedLeadsF[1].id);
    }

    const { data: ahmedActiveF } = await admin.from('leads').select('id').eq('assigned_to', ahmed.id).eq('status', 'new');
    const { data: mohamedActiveF } = await admin.from('leads').select('id').eq('assigned_to', mohamed.id).eq('status', 'new');
    const { data: pendingF } = await admin.from('leads').select('id').in('id', batchDLeadIds).is('assigned_to', null);

    recordTest(
      'Sticky Assignment',
      'Ahmed leads were NOT reassigned when Mohamed refilled; Mohamed received 2 refilled leads',
      ahmedActiveF?.length === 5 && mohamedActiveF?.length === 5 && pendingF?.length === 3,
      `Ahmed active: ${ahmedActiveF?.length}, Mohamed active: ${mohamedActiveF?.length}, Pending remaining: ${pendingF?.length}`
    );

    // ────────────────────────────────────────────────────────────────
    // TEST G & H: Offline & Stale Heartbeat Eligibility
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test G & H: Offline & Stale Heartbeat Eligibility ---');
    await cleanDatabaseState();

    const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    await admin.from('employees').update({ is_online: true, last_heartbeat: sixMinAgo }).eq('id', ahmed.id);

    const { data: staleLead } = await admin.from('leads').insert({
      full_name: 'Stale Heartbeat Test Lead 4B',
      phone: '+20104BSTALE',
      status: 'new',
      assignment_source: 'unassigned',
    }).select('id').single();

    await admin.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo', p_batch_limit: BACKLOG_BATCH_LIMIT });

    const { data: ahmedStaleCheck } = await admin.from('employees').select('is_online').eq('id', ahmed.id).single();
    const { data: leadStaleCheck } = await admin.from('leads').select('assigned_to').eq('id', staleLead?.id).single();

    recordTest(
      'Stale Heartbeat',
      'Stale employee (>5 min) marked offline and received NO new leads',
      ahmedStaleCheck?.is_online === false && leadStaleCheck?.assigned_to === null,
      `Ahmed online: ${ahmedStaleCheck?.is_online}, Assigned to: ${leadStaleCheck?.assigned_to}`
    );

    // ────────────────────────────────────────────────────────────────
    // TEST I: FIFO Queue Ordering
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test I: FIFO Queue Ordering (oldest received_at first) ---');
    await cleanDatabaseState();
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).eq('id', ahmed.id);

    const nowTs = Date.now();
    const { data: fifo1 } = await admin.from('leads').insert({ full_name: 'FIFO 1 (Oldest)', phone: '+20104BFIFO1', status: 'new', assignment_source: 'unassigned', received_at: new Date(nowTs - 10000).toISOString() }).select('id').single();
    await admin.from('leads').insert({ full_name: 'FIFO 2 (Middle)', phone: '+20104BFIFO2', status: 'new', assignment_source: 'unassigned', received_at: new Date(nowTs - 5000).toISOString() });
    await admin.from('leads').insert({ full_name: 'FIFO 3 (Newest)', phone: '+20104BFIFO3', status: 'new', assignment_source: 'unassigned', received_at: new Date(nowTs).toISOString() });

    await admin.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo', p_batch_limit: 1 });

    const { data: assignedFifoLead } = await admin.from('leads').select('id, full_name').eq('assigned_to', ahmed.id).single();

    recordTest(
      'FIFO Queue Order',
      'Oldest received_at lead (FIFO 1) was assigned first',
      assignedFifoLead?.id === fifo1?.id,
      `Assigned lead: ${assignedFifoLead?.full_name}`
    );

    // ────────────────────────────────────────────────────────────────
    // TEST J & K: Concurrency & Capacity Lock Verification
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test J & K: Concurrency & Capacity Lock Verification ---');
    await cleanDatabaseState();
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).eq('id', ahmed.id);

    const concInitialPayloads = Array.from({ length: 4 }, (_, i) => ({
      full_name: `Ahmed Existing ${i + 1}`,
      phone: `+20104BEXIST${i + 1}`,
      status: 'new',
      assigned_to: ahmed.id,
      assignment_source: 'automatic',
    }));
    await admin.from('leads').insert(concInitialPayloads);

    const concPendingPayloads = Array.from({ length: 5 }, (_, i) => ({
      full_name: `Concurrent Lead ${i + 1}`,
      phone: `+20104BCONC${i + 1}`,
      status: 'new',
      assignment_source: 'unassigned',
    }));
    await admin.from('leads').insert(concPendingPayloads);

    await Promise.all([
      admin.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo', p_batch_limit: BACKLOG_BATCH_LIMIT }),
      admin.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo', p_batch_limit: BACKLOG_BATCH_LIMIT }),
      admin.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo', p_batch_limit: BACKLOG_BATCH_LIMIT }),
      admin.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo', p_batch_limit: BACKLOG_BATCH_LIMIT }),
      admin.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo', p_batch_limit: BACKLOG_BATCH_LIMIT }),
    ]);

    const { data: ahmedConcActive } = await admin.from('leads').select('id').eq('assigned_to', ahmed.id).eq('status', 'new');

    recordTest(
      'Concurrency Safety',
      '5 concurrent refill requests never exceeded 5 active backlog leads for Ahmed',
      ahmedConcActive?.length === BACKLOG_BATCH_LIMIT,
      `Ahmed active count after concurrent execution: ${ahmedConcActive?.length}`
    );

    // ────────────────────────────────────────────────────────────────
    // TEST N: Lead ↔ Conversation Assignment Sync
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test N: Lead ↔ Conversation Assignment Synchronization ---');
    await cleanDatabaseState();
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).eq('id', ahmed.id);

    const { data: syncLead } = await admin.from('leads').insert({
      full_name: 'Sync Verification Lead 4B',
      phone: '+20104BSYNC',
      status: 'new',
      assignment_source: 'unassigned',
    }).select('id').single();

    const { data: syncIdentity } = await admin.from('channel_identities').insert({
      channel: 'whatsapp',
      external_id: 'sync_user_4b',
      display_name: 'Sync User 4B',
    }).select('id').single();

    const { data: syncConv } = await admin.from('conversations').insert({
      channel: 'whatsapp',
      external_thread_id: 'sync_thread_4b',
      channel_identity_id: syncIdentity?.id,
      lead_id: syncLead?.id,
      status: 'pending_assignment',
    }).select('id').single();

    await admin.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo', p_batch_limit: BACKLOG_BATCH_LIMIT });

    const { data: finalSyncLead } = await admin.from('leads').select('assigned_to').eq('id', syncLead?.id).single();
    const { data: finalSyncConv } = await admin.from('conversations').select('assigned_to, status').eq('id', syncConv?.id).single();

    recordTest(
      'Conversation Sync',
      'Lead assignment synchronized lead.assigned_to == conversation.assigned_to and status=open',
      finalSyncLead?.assigned_to === ahmed.id && finalSyncConv?.assigned_to === ahmed.id && finalSyncConv?.status === 'open',
      `Lead owner: ${finalSyncLead?.assigned_to}, Conv owner: ${finalSyncConv?.assigned_to}, Conv status: ${finalSyncConv?.status}`
    );

    // ────────────────────────────────────────────────────────────────
    // TEST O: Security & Anonymous RPC Execution Guard
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- Test O: Security & Privilege Escalation Guards ---');
    const anonClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const { error: anonProcessErr } = await anonClient.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo' });
    const { error: anonAssignErr } = await anonClient.rpc('assign_lead_to_sales', { p_lead_id: '00000000-0000-0000-0000-000000000000' });

    recordTest(
      'Anonymous Security',
      'Anonymous execution of process_pending_unassigned_leads RPC strictly denied',
      !!anonProcessErr,
      anonProcessErr?.message
    );

    recordTest(
      'Anonymous Security',
      'Anonymous execution of assign_lead_to_sales RPC strictly denied',
      !!anonAssignErr,
      anonAssignErr?.message
    );

    // ────────────────────────────────────────────────────────────────
    // FINAL SUMMARY
    // ────────────────────────────────────────────────────────────────
    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log('📊 PHASE 4B TEST EXECUTION SUMMARY');
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log(`Total Tests Run: ${totalTests}`);
    console.log(`Passed:          ${passedTests}`);
    console.log(`Failed:          ${failedTests}`);
    console.log(`Success Rate:    ${((passedTests / totalTests) * 100).toFixed(1)}%`);

    if (failedTests > 0) {
      console.error('\n❌ PHASE 4B VERIFICATION FAILED');
      process.exit(1);
    } else {
      console.log('\n🎉 ALL PHASE 4B VERIFICATION TESTS PASSED SUCCESSFULLY!');
    }
  } catch (err: unknown) {
    console.error('Fatal error during test suite execution:', err);
    process.exit(1);
  }
}

runPhase4bTestSuite();
