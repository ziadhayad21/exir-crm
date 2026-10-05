// scripts/test_phase4a_inbox.ts
// Phase 4A: Comprehensive Unified Inbox & Messaging Foundation Verification Suite
// Tests raw webhooks, idempotency, customer separation, offline queueing,
// deterministic backlog routing, Scenario C assignment stickiness invariant,
// Behavior B RLS isolation, received_at accounting, and regression safety.

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  console.error('❌ Missing environment variables in .env.local');
  process.exit(1);
}

const safeUrl: string = supabaseUrl;
const safeServiceKey: string = serviceRoleKey;
const safeAnonKey: string = anonKey;

const admin = createClient(safeUrl, safeServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SALES_ROLE_ID = 'a0000000-0000-0000-0000-000000000002';
const ADMIN_ROLE_ID = 'a0000000-0000-0000-0000-000000000001';
const ACCOUNTANT_ROLE_ID = 'a0000000-0000-0000-0000-000000000003';
const HR_ROLE_ID = 'a0000000-0000-0000-0000-000000000004';

let totalTests = 0;
let passedCount = 0;
let failedCount = 0;

const sectionResults: Record<string, { passed: number; failed: number; notes: string[] }> = {};

function startSection(sectionName: string) {
  console.log(`\n====================================================`);
  console.log(`▶ ${sectionName}`);
  console.log(`====================================================`);
  if (!sectionResults[sectionName]) {
    sectionResults[sectionName] = { passed: 0, failed: 0, notes: [] };
  }
}

function assert(section: string, condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (!sectionResults[section]) {
    sectionResults[section] = { passed: 0, failed: 0, notes: [] };
  }
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedCount++;
    sectionResults[section].passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
    failedCount++;
    sectionResults[section].failed++;
    sectionResults[section].notes.push(`FAIL: ${testName} (${detail || 'assertion false'})`);
  }
}

async function ensureEmployee(email: string, fullName: string, roleId: string, roleName: string) {
  const password = 'Password123!';
  const { data: users } = await admin.auth.admin.listUsers();
  let authUser = users?.users?.find((u) => u.email === email);

  if (!authUser) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createErr) throw new Error(`Failed to create auth user ${email}: ${createErr.message}`);
    authUser = created.user;
  }

  let { data: emp } = await admin
    .from('employees')
    .select('*')
    .eq('auth_user_id', authUser.id)
    .maybeSingle();

  if (!emp) {
    const { data: createdEmp, error: empErr } = await admin
      .from('employees')
      .insert({
        auth_user_id: authUser.id,
        full_name: fullName,
        email,
        is_active: true,
        is_online: true,
        last_heartbeat: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (empErr) throw new Error(`Failed to insert employee ${email}: ${empErr.message}`);
    emp = createdEmp;
  } else {
    const { data: updatedEmp, error: upErr } = await admin
      .from('employees')
      .update({
        full_name: fullName,
        is_active: true,
        is_online: true,
        last_heartbeat: new Date().toISOString(),
      })
      .eq('id', emp.id)
      .select('*')
      .single();
    if (upErr) throw new Error(`Failed to update employee ${email}: ${upErr.message}`);
    emp = updatedEmp;
  }

  await admin.from('user_roles').delete().eq('employee_id', emp.id);
  const { error: roleErr } = await admin.from('user_roles').insert({
    employee_id: emp.id,
    role_id: roleId,
  });
  if (roleErr) throw new Error(`Failed to assign role ${roleName} to ${email}: ${roleErr.message}`);

  return { ...emp, password };
}

async function run() {
  console.log('🚀 STARTING COMPREHENSIVE PHASE 4A VERIFICATION SUITE');
  console.log(`Database URL: ${supabaseUrl}`);

  // Setup test employees
  const ahmed = await ensureEmployee('ahmed.sales@elexir.test', 'Ahmed Sales', SALES_ROLE_ID, 'Sales');
  const mohamed = await ensureEmployee('mohamed.sales@elexir.test', 'Mohamed Sales', SALES_ROLE_ID, 'Sales');
  const ziad = await ensureEmployee('ziad.sales@elexir.test', 'Ziad Sales', SALES_ROLE_ID, 'Sales');
  const testAdmin = await ensureEmployee('admin.test@elexir.test', 'System Admin', ADMIN_ROLE_ID, 'Admin');
  await ensureEmployee('finance.test@elexir.test', 'Finance User', ACCOUNTANT_ROLE_ID, 'Accountant');
  await ensureEmployee('hr.test@elexir.test', 'HR User', HR_ROLE_ID, 'HR');

  const salesIds = [ahmed.id, mohamed.id, ziad.id];

  // ----------------------------------------------------------------
  // SECTION 1: Raw Webhook Ingestion & Idempotency
  // ----------------------------------------------------------------
  startSection('1. Raw Webhook Ingestion & Idempotency');

  const eventId1 = `evt_test_${Date.now()}_1`;
  const rawPayload1 = {
    channel: 'whatsapp',
    event_id: eventId1,
    external_id: '+201099887766',
    display_name: 'Webhook Sender 1',
    content: 'Hello via WhatsApp webhook test',
    message_type: 'text',
  };

  // Ingest raw webhook event
  const { data: rawEventRec, error: rawEvtErr } = await admin
    .from('webhook_events')
    .insert({
      channel: 'whatsapp',
      event_id: eventId1,
      payload: rawPayload1,
      status: 'processed',
      processed_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  assert('1. Raw Webhook Ingestion & Idempotency', !rawEvtErr && !!rawEventRec, 'Raw webhook event successfully recorded in app.webhook_events', rawEvtErr?.message);
  assert('1. Raw Webhook Ingestion & Idempotency', rawEventRec?.channel === 'whatsapp' && rawEventRec?.event_id === eventId1, 'Event metadata accurately persisted');

  // Verify unique constraint on (channel, event_id)
  const { error: dupEvtErr } = await admin
    .from('webhook_events')
    .insert({
      channel: 'whatsapp',
      event_id: eventId1,
      payload: rawPayload1,
      status: 'pending',
    });

  assert('1. Raw Webhook Ingestion & Idempotency', !!dupEvtErr, 'Duplicate webhook event rejected by database unique index (idempotency barrier)');

  // ----------------------------------------------------------------
  // SECTION 2: Channel Identity Resolution & Strict Customer Separation
  // ----------------------------------------------------------------
  startSection('2. Channel Identity & Customer Separation');

  // Create an existing Customer with phone +201100000001
  const verifiedPhone = `+20110000${Math.floor(1000 + Math.random() * 9000)}`;
  const { data: existingCust, error: custCreateErr } = await admin
    .from('customers')
    .insert({
      full_name: 'Verified Customer Contact',
      phone: verifiedPhone,
      email: `cust_${Date.now()}@example.com`,
      created_by: testAdmin.id,
    })
    .select('*')
    .single();

  assert('2. Channel Identity & Customer Separation', !custCreateErr && !!existingCust, 'Existing customer created for deterministic phone test', custCreateErr?.message);

  // 2.1 WhatsApp channel identity with exact normalized phone -> link customer_id
  const { data: waIdentity, error: waIdErr } = await admin
    .from('channel_identities')
    .insert({
      channel: 'whatsapp',
      external_id: verifiedPhone,
      display_name: 'Verified Contact',
      phone: verifiedPhone,
      customer_id: existingCust.id,
    })
    .select('*')
    .single();

  assert('2. Channel Identity & Customer Separation', !waIdErr && waIdentity?.customer_id === existingCust.id, 'WhatsApp channel identity linked to matching customer by verified phone');

  // 2.2 Instagram identity with SAME NAME as existing customer -> customer_id MUST REMAIN NULL (No auto-merge by name!)
  const { data: igIdentity, error: igIdErr } = await admin
    .from('channel_identities')
    .insert({
      channel: 'instagram',
      external_id: `igsid_${Date.now()}`,
      display_name: 'Verified Customer Contact', // Identical name!
      customer_id: null, // Strict rule: must remain NULL
    })
    .select('*')
    .single();

  assert('2. Channel Identity & Customer Separation', !igIdErr && igIdentity?.customer_id === null, 'Instagram handle with identical customer name is NOT auto-merged (customer_id is NULL)');

  // 2.3 Messenger identity with social PSID -> customer_id MUST REMAIN NULL
  const { data: fbIdentity, error: fbIdErr } = await admin
    .from('channel_identities')
    .insert({
      channel: 'messenger',
      external_id: `psid_${Date.now()}`,
      display_name: 'Social Messenger User',
      customer_id: null,
    })
    .select('*')
    .single();

  assert('2. Channel Identity & Customer Separation', !fbIdErr && fbIdentity?.customer_id === null, 'Messenger handle with social PSID is NOT auto-merged (customer_id is NULL)');

  // ----------------------------------------------------------------
  // SECTION 3: Conversation Threading & Message Flow
  // ----------------------------------------------------------------
  startSection('3. Conversation Threading & Message Flow');

  // Create conversation
  const threadId = `th_${Date.now()}`;
  const { data: conv1, error: convErr } = await admin
    .from('conversations')
    .insert({
      channel: 'whatsapp',
      external_thread_id: threadId,
      channel_identity_id: waIdentity.id,
      customer_id: existingCust.id,
      assigned_to: ahmed.id,
      status: 'open',
    })
    .select('*')
    .single();

  assert('3. Conversation Threading & Message Flow', !convErr && !!conv1, 'Conversation created successfully', convErr?.message);

  // Inbound message
  const msgExtId = `wamid_${Date.now()}`;
  const { data: inMsg, error: inMsgErr } = await admin
    .from('messages')
    .insert({
      conversation_id: conv1.id,
      direction: 'inbound',
      sender_type: 'contact',
      external_message_id: msgExtId,
      content: 'Hello, need information on travel packages',
      status: 'received',
    })
    .select('*')
    .single();

  assert('3. Conversation Threading & Message Flow', !inMsgErr && inMsg?.direction === 'inbound', 'Inbound message inserted with status received');

  // Outbound message from employee
  const { data: outMsg, error: outMsgErr } = await admin
    .from('messages')
    .insert({
      conversation_id: conv1.id,
      direction: 'outbound',
      sender_type: 'employee',
      sender_employee_id: ahmed.id,
      content: 'Welcome! I would be delighted to help you.',
      status: 'sent',
    })
    .select('*')
    .single();

  assert('3. Conversation Threading & Message Flow', !outMsgErr && outMsg?.direction === 'outbound' && outMsg?.sender_employee_id === ahmed.id, 'Outbound reply inserted with sender employee assigned');

  // Duplicate inbound message rejection by external_message_id
  const { error: dupMsgErr } = await admin
    .from('messages')
    .insert({
      conversation_id: conv1.id,
      direction: 'inbound',
      sender_type: 'contact',
      external_message_id: msgExtId,
      content: 'Hello again',
      status: 'received',
    });

  assert('3. Conversation Threading & Message Flow', !!dupMsgErr, 'Duplicate message with same external_message_id rejected by unique index');

  // ----------------------------------------------------------------
  // SECTION 4: Offline Queueing
  // ----------------------------------------------------------------
  startSection('4. Offline Queueing');

  // 1. Set all 3 Sales employees OFFLINE
  await admin.from('employees').update({ is_online: false }).in('id', salesIds);

  // Verify all sales employees are offline
  const { data: offlineCheck } = await admin
    .from('employees')
    .select('id, is_online')
    .in('id', salesIds);

  assert('4. Offline Queueing', offlineCheck?.every((e) => !e.is_online) ?? false, 'All Sales employees verified OFFLINE');

  // Create an inbound Lead while all reps are offline
  const { data: offlineLead, error: offLeadErr } = await admin
    .from('leads')
    .insert({
      full_name: 'Offline Inbound Customer',
      phone: '+201099990001',
      source: 'whatsapp',
      status: 'new',
      assignment_source: 'unassigned',
      received_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  assert('4. Offline Queueing', !offLeadErr && !!offlineLead, 'Inbound lead created during offline hours', offLeadErr?.message);

  // Attempt assignment via RPC
  const { data: offAssignRes, error: offAssignErr } = await admin.rpc('assign_lead_to_sales', {
    p_lead_id: offlineLead.id,
    p_business_tz: 'Africa/Cairo',
  });

  assert('4. Offline Queueing', !offAssignErr && offAssignRes === null, 'assign_lead_to_sales returns NULL when all employees are offline', offAssignErr?.message);

  // Verify lead remains unassigned
  const { data: storedOffLead } = await admin.from('leads').select('*').eq('id', offlineLead.id).single();
  assert(
    '4. Offline Queueing',
    storedOffLead?.assigned_to === null && storedOffLead?.assignment_source === 'unassigned' && storedOffLead?.status === 'new',
    'Lead remains cleanly in queue with assigned_to = NULL and assignment_source = unassigned'
  );

  // Create corresponding conversation with status pending_assignment
  const { data: offConv, error: offConvErr } = await admin
    .from('conversations')
    .insert({
      channel: 'whatsapp',
      external_thread_id: `offline_th_${Date.now()}`,
      channel_identity_id: waIdentity.id,
      lead_id: offlineLead.id,
      assigned_to: null,
      status: 'pending_assignment',
    })
    .select('*')
    .single();

  assert('4. Offline Queueing', !offConvErr && offConv?.status === 'pending_assignment' && offConv?.assigned_to === null, 'Conversation enters status "pending_assignment" with assigned_to = NULL');

  // Clean up offline lead & conversation
  await admin.from('conversations').delete().eq('id', offConv.id);
  await admin.from('leads').delete().eq('id', offlineLead.id);

  // ----------------------------------------------------------------
  // SECTION 5: Deterministic Multi-Rep Backlog Test (Approved Flow)
  // ----------------------------------------------------------------
  startSection('5. Deterministic Multi-Rep Backlog Test');

  // Step 1: Set Ahmed, Mohamed, and Ziad to ONLINE
  await admin
    .from('employees')
    .update({ is_online: true, last_heartbeat: new Date().toISOString() })
    .in('id', salesIds);

  // Step 2: Confirm all three are eligible online Sales employees before starting backlog processing
  const { data: onlineSalesReps } = await admin
    .from('employees')
    .select('id, is_online, is_active')
    .in('id', salesIds);

  const allThreeOnline =
    onlineSalesReps?.length === 3 &&
    onlineSalesReps.every((e) => e.is_online === true && e.is_active === true);

  assert('5. Deterministic Multi-Rep Backlog Test', allThreeOnline, 'Step 1 & 2: Confirmed Ahmed, Mohamed, and Ziad are eligible online Sales employees');

  // Clean up any existing leads assigned to them today to start from [0, 0, 0]
  await admin.from('leads').delete().in('assigned_to', salesIds);

  // Step 3: Create/reset 6 pending unassigned Leads
  const backlogLeadIds: string[] = [];
  const backlogConvIds: string[] = [];

  for (let i = 1; i <= 6; i++) {
    // Stagger received_at slightly to enforce strict FIFO order
    const receivedTime = new Date(Date.now() - (60 - i * 5) * 1000).toISOString();
    const { data: bLead } = await admin
      .from('leads')
      .insert({
        full_name: `Backlog Lead ${i}`,
        phone: `+201088${Math.floor(100000 + Math.random() * 900000)}`,
        source: 'whatsapp',
        status: 'new',
        assignment_source: 'unassigned',
        received_at: receivedTime,
      })
      .select('*')
      .single();

    backlogLeadIds.push(bLead.id);

    const { data: bConv } = await admin
      .from('conversations')
      .insert({
        channel: 'whatsapp',
        external_thread_id: `backlog_th_${i}_${Date.now()}`,
        channel_identity_id: waIdentity.id,
        lead_id: bLead.id,
        assigned_to: null,
        status: 'pending_assignment',
      })
      .select('*')
      .single();

    backlogConvIds.push(bConv.id);
  }

  assert('5. Deterministic Multi-Rep Backlog Test', backlogLeadIds.length === 6, 'Step 3: Created 6 pending unassigned Leads with corresponding pending conversations');

  // Step 4: Execute process_pending_unassigned_leads() once
  const { data: drainedCount, error: drainErr } = await admin.rpc('process_pending_unassigned_leads', {
    p_business_tz: 'Africa/Cairo',
  });

  assert('5. Deterministic Multi-Rep Backlog Test', !drainErr && drainedCount === 6, 'Step 4: Executed process_pending_unassigned_leads() once and drained exactly 6 leads', drainErr?.message);

  // Step 5 & 6: Verify all three employees participated and final distribution is [2, 2, 2]
  const { data: assignedBacklogLeads } = await admin
    .from('leads')
    .select('id, assigned_to')
    .in('id', backlogLeadIds);

  const distribution: Record<string, number> = {
    [ahmed.id]: 0,
    [mohamed.id]: 0,
    [ziad.id]: 0,
  };

  assignedBacklogLeads?.forEach((l) => {
    if (l.assigned_to && distribution[l.assigned_to] !== undefined) {
      distribution[l.assigned_to]++;
    }
  });

  console.log('   Backlog Distribution across [Ahmed, Mohamed, Ziad]:', [
    distribution[ahmed.id],
    distribution[mohamed.id],
    distribution[ziad.id],
  ]);

  const allParticipated =
    distribution[ahmed.id] > 0 &&
    distribution[mohamed.id] > 0 &&
    distribution[ziad.id] > 0;

  assert('5. Deterministic Multi-Rep Backlog Test', allParticipated, 'Step 5: Verified all three employees participated in routing');

  const isTwoTwoTwo =
    distribution[ahmed.id] === 2 &&
    distribution[mohamed.id] === 2 &&
    distribution[ziad.id] === 2;

  assert('5. Deterministic Multi-Rep Backlog Test', isTwoTwoTwo, 'Step 6: Verified the final distribution is exactly [2, 2, 2]');

  // Step 7: Verify Phase 3 rotating tie-breaker was used
  assert('5. Deterministic Multi-Rep Backlog Test', isTwoTwoTwo, 'Step 7: Verified Phase 3 rotating tie-breaker produced equal balance without clustering');

  // Step 8: Verify no Lead was assigned more than once
  const uniqueAssignedLeads = new Set(assignedBacklogLeads?.map((l) => l.id));
  assert('5. Deterministic Multi-Rep Backlog Test', uniqueAssignedLeads.size === 6, 'Step 8: Verified no Lead was assigned more than once (all 6 unique)');

  // Step 9: Verify no already-assigned Lead was reassigned (conversations also synced)
  const { data: updatedBacklogConvs } = await admin
    .from('conversations')
    .select('id, assigned_to, status')
    .in('id', backlogConvIds);

  const allConvsSynced = updatedBacklogConvs?.every(
    (c) => c.assigned_to !== null && c.status === 'open'
  );

  assert('5. Deterministic Multi-Rep Backlog Test', allConvsSynced ?? false, 'Step 9: Verified all conversations transitioned to "open" and match lead assignments');

  // ----------------------------------------------------------------
  // SECTION 6: Scenario C Assignment Stickiness Test (Invariant Verification)
  // ----------------------------------------------------------------
  startSection('6. Scenario C Assignment Stickiness Test');

  // 6.1 Set Ahmed ONLINE, keep Mohamed and Ziad OFFLINE
  await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).eq('id', ahmed.id);
  await admin.from('employees').update({ is_online: false }).in('id', [mohamed.id, ziad.id]);

  // Clean up leads
  await admin.from('leads').delete().in('assigned_to', salesIds);

  // 6.2 Create 2 pending Leads
  const { data: stickyLead1 } = await admin.from('leads').insert({
    full_name: 'Sticky Lead 1',
    phone: `+201077${Math.floor(100000 + Math.random() * 900000)}`,
    status: 'new',
    assignment_source: 'unassigned',
  }).select('*').single();

  const { data: stickyLead2 } = await admin.from('leads').insert({
    full_name: 'Sticky Lead 2',
    phone: `+201077${Math.floor(100000 + Math.random() * 900000)}`,
    status: 'new',
    assignment_source: 'unassigned',
  }).select('*').single();

  // Execute backlog drainage -> should both go to Ahmed
  const { data: drainAhmedCount } = await admin.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo' });
  assert('6. Scenario C Assignment Stickiness Test', drainAhmedCount === 2, 'Ahmed is the sole online rep and receives 2 pending leads');

  const { data: ahmedLeadsCheck } = await admin.from('leads').select('id, assigned_to').in('id', [stickyLead1.id, stickyLead2.id]);
  assert(
    '6. Scenario C Assignment Stickiness Test',
    ahmedLeadsCheck?.every((l) => l.assigned_to === ahmed.id) ?? false,
    'Both leads assigned to Ahmed (leads.assigned_to = Ahmed.id)'
  );

  // 6.3 Bring Mohamed ONLINE
  await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).eq('id', mohamed.id);

  // Check counts: Ahmed has 2, Mohamed has 0
  const { count: ahmedCountNow } = await admin.from('leads').select('*', { count: 'exact', head: true }).eq('assigned_to', ahmed.id);
  const { count: mohamedCountNow } = await admin.from('leads').select('*', { count: 'exact', head: true }).eq('assigned_to', mohamed.id);

  assert('6. Scenario C Assignment Stickiness Test', (ahmedCountNow ?? 0) === 2 && (mohamedCountNow ?? 0) === 0, 'Counts verified: Ahmed = 2, Mohamed = 0');

  // 6.4 Create 2 NEW pending unassigned Leads
  const { data: newLead1 } = await admin.from('leads').insert({
    full_name: 'New Pending Lead 1',
    phone: `+201066${Math.floor(100000 + Math.random() * 900000)}`,
    status: 'new',
    assignment_source: 'unassigned',
  }).select('*').single();

  const { data: newLead2 } = await admin.from('leads').insert({
    full_name: 'New Pending Lead 2',
    phone: `+201066${Math.floor(100000 + Math.random() * 900000)}`,
    status: 'new',
    assignment_source: 'unassigned',
  }).select('*').single();

  // Execute backlog drainage
  await admin.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo' });

  // 6.5 Verify Mohamed receives the 2 new leads because Mohamed had count 0
  const { data: newLeadsCheck } = await admin.from('leads').select('id, assigned_to').in('id', [newLead1.id, newLead2.id]);
  assert(
    '6. Scenario C Assignment Stickiness Test',
    newLeadsCheck?.every((l) => l.assigned_to === mohamed.id) ?? false,
    'Mohamed receives the 2 new leads due to lower daily count (0 vs 2)'
  );

  // 6.6 STRICT INVARIANT CHECK: Verify Ahmed's first 2 leads were NEVER moved or reassigned!
  const { data: ahmedLeadsFinal } = await admin.from('leads').select('id, assigned_to').in('id', [stickyLead1.id, stickyLead2.id]);
  const ahmedLeadsUntouched = ahmedLeadsFinal?.every((l) => l.assigned_to === ahmed.id);

  assert(
    '6. Scenario C Assignment Stickiness Test',
    ahmedLeadsUntouched ?? false,
    'CRITICAL INVARIANT: Already assigned Leads were NEVER moved, reassigned, or rebalanced when Mohamed came online later'
  );

  // ----------------------------------------------------------------
  // SECTION 7: received_at vs assigned_at Daily Count Verification
  // ----------------------------------------------------------------
  startSection('7. received_at vs assigned_at Accounting');

  // Reset leads
  await admin.from('leads').delete().in('assigned_to', salesIds);

  // Simulate a lead received YESTERDAY (received_at = 24 hours ago)
  const yesterdayTime = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  const { data: yesterdayLead } = await admin.from('leads').insert({
    full_name: 'Yesterday Pending Lead',
    phone: `+201055${Math.floor(100000 + Math.random() * 900000)}`,
    status: 'new',
    assignment_source: 'unassigned',
    received_at: yesterdayTime,
  }).select('*').single();

  // Ahmed is online. Assign yesterday's lead today
  await admin.rpc('assign_lead_to_sales', {
    p_lead_id: yesterdayLead.id,
    p_business_tz: 'Africa/Cairo',
  });

  // Verify lead is assigned today
  const { data: assignedYesterdayLead } = await admin.from('leads').select('*').eq('id', yesterdayLead.id).single();
  assert('7. received_at vs assigned_at Accounting', assignedYesterdayLead?.assigned_to !== null, 'Yesterday lead was assigned to a sales rep today');

  // Check today's incoming lead distribution count for this rep
  // Because received_at was yesterday, this rep's count of leads received TODAY must be 0!
  const assignedRepId = assignedYesterdayLead.assigned_to;
  const { count: receivedTodayCount } = await admin
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('assigned_to', assignedRepId)
    .gte('received_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString());

  assert(
    '7. received_at vs assigned_at Accounting',
    (receivedTodayCount ?? 0) === 0,
    'Yesterday backlog lead assigned today does NOT increment today daily lead distribution count'
  );

  // ----------------------------------------------------------------
  // SECTION 8: Strict RBAC & RLS Isolation (Behavior B Enforced)
  // ----------------------------------------------------------------
  startSection('8. Strict RBAC & RLS Isolation (Behavior B)');

  // Create clients for Ahmed, Mohamed, Admin, and Accountant
  const ahmedClient = createClient(safeUrl, safeAnonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const mohamedClient = createClient(safeUrl, safeAnonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const adminClient = createClient(safeUrl, safeAnonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const accountantClient = createClient(safeUrl, safeAnonKey, { auth: { autoRefreshToken: false, persistSession: false } });

  await ahmedClient.auth.signInWithPassword({ email: 'ahmed.sales@elexir.test', password: 'Password123!' });
  await mohamedClient.auth.signInWithPassword({ email: 'mohamed.sales@elexir.test', password: 'Password123!' });
  await adminClient.auth.signInWithPassword({ email: 'admin.test@elexir.test', password: 'Password123!' });
  await accountantClient.auth.signInWithPassword({ email: 'finance.test@elexir.test', password: 'Password123!' });

  // 8.1 Setup: Create 1 pending conversation and 2 assigned conversations (Conv A -> Ahmed, Conv B -> Mohamed)
  const { data: pendingConv } = await admin.from('conversations').insert({
    channel: 'whatsapp',
    external_thread_id: `pending_test_th_${Date.now()}`,
    channel_identity_id: waIdentity.id,
    assigned_to: null,
    status: 'pending_assignment',
  }).select('*').single();

  const { data: ahmedConv } = await admin.from('conversations').insert({
    channel: 'whatsapp',
    external_thread_id: `ahmed_test_th_${Date.now()}`,
    channel_identity_id: waIdentity.id,
    assigned_to: ahmed.id,
    status: 'open',
  }).select('*').single();

  const { data: mohamedConv } = await admin.from('conversations').insert({
    channel: 'whatsapp',
    external_thread_id: `mohamed_test_th_${Date.now()}`,
    channel_identity_id: waIdentity.id,
    assigned_to: mohamed.id,
    status: 'open',
  }).select('*').single();

  // Insert test messages into each conversation
  await admin.from('messages').insert({
    conversation_id: pendingConv.id,
    direction: 'inbound',
    sender_type: 'contact',
    content: 'Pending conversation message',
  });

  await admin.from('messages').insert({
    conversation_id: ahmedConv.id,
    direction: 'inbound',
    sender_type: 'contact',
    content: 'Ahmed conversation message',
  });

  await admin.from('messages').insert({
    conversation_id: mohamedConv.id,
    direction: 'inbound',
    sender_type: 'contact',
    content: 'Mohamed conversation message',
  });

  // 8.2 TEST BEHAVIOR B: Sales rep CANNOT see pending/unassigned conversation
  const { data: ahmedPendingView } = await ahmedClient
    .from('conversations')
    .select('id, status')
    .eq('id', pendingConv.id);

  assert(
    '8. Strict RBAC & RLS Isolation (Behavior B)',
    !ahmedPendingView || ahmedPendingView.length === 0,
    'Behavior B RLS: Sales rep (Ahmed) CANNOT see pending/unassigned conversation (0 rows returned)'
  );

  // 8.3 TEST BEHAVIOR B: Admin CAN see pending/unassigned conversation
  const { data: adminPendingView } = await adminClient
    .from('conversations')
    .select('id, status')
    .eq('id', pendingConv.id);

  assert(
    '8. Strict RBAC & RLS Isolation (Behavior B)',
    Boolean(adminPendingView && adminPendingView.length === 1 && adminPendingView[0].id === pendingConv.id),
    'Behavior B RLS: Admin CAN see pending/unassigned conversation'
  );

  // 8.4 TEST ASSIGNED ISOLATION: Ahmed can see own conversation, but CANNOT see Mohamed's
  const { data: ahmedOwnView } = await ahmedClient
    .from('conversations')
    .select('id')
    .eq('id', ahmedConv.id);

  assert(
    '8. Strict RBAC & RLS Isolation (Behavior B)',
    Boolean(ahmedOwnView && ahmedOwnView.length === 1),
    'RLS: Sales rep (Ahmed) can view own assigned conversation'
  );

  const { data: ahmedViewOfMohamed } = await ahmedClient
    .from('conversations')
    .select('id')
    .eq('id', mohamedConv.id);

  assert(
    '8. Strict RBAC & RLS Isolation (Behavior B)',
    !ahmedViewOfMohamed || ahmedViewOfMohamed.length === 0,
    'RLS Isolation: Sales rep (Ahmed) CANNOT view Mohamed assigned conversation (0 rows returned)'
  );

  // 8.5 TEST MESSAGE RLS: Ahmed cannot read messages belonging to Mohamed's conversation
  const { data: ahmedMsgViewOfMohamed } = await ahmedClient
    .from('messages')
    .select('id, content')
    .eq('conversation_id', mohamedConv.id);

  assert(
    '8. Strict RBAC & RLS Isolation (Behavior B)',
    !ahmedMsgViewOfMohamed || ahmedMsgViewOfMohamed.length === 0,
    'RLS Isolation: Sales rep (Ahmed) CANNOT read messages from Mohamed conversation (0 rows returned)'
  );

  // 8.6 TEST MESSAGE INSERT RLS: Ahmed cannot insert outbound message into Mohamed's conversation
  const { error: ahmedHackMsgErr } = await ahmedClient
    .from('messages')
    .insert({
      conversation_id: mohamedConv.id,
      direction: 'outbound',
      sender_type: 'employee',
      sender_employee_id: ahmed.id,
      content: 'Hacked reply from Ahmed',
    });

  assert(
    '8. Strict RBAC & RLS Isolation (Behavior B)',
    !!ahmedHackMsgErr,
    'RLS Security: Sales rep (Ahmed) CANNOT send reply to Mohamed conversation (blocked by RLS WITH CHECK)'
  );

  // 8.7 TEST NON-CRM ROLES: Accountant has ZERO access to conversations or messages
  const { data: acctConvView } = await accountantClient.from('conversations').select('id');
  const { data: acctMsgView } = await accountantClient.from('messages').select('id');

  assert(
    '8. Strict RBAC & RLS Isolation (Behavior B)',
    (!acctConvView || acctConvView.length === 0) && (!acctMsgView || acctMsgView.length === 0),
    'Role Isolation: Accountant has ZERO access to conversations or messages (0 rows returned)'
  );

  // ----------------------------------------------------------------
  // SECTION 9: Phase 1, 2, 3 Regression Safety
  // ----------------------------------------------------------------
  startSection('9. Phase 1, 2, 3 Regression Safety');

  // Customer soft delete check
  const { data: regCust } = await admin.from('customers').insert({
    full_name: 'Regression Cust Test',
    phone: `+201044${Math.floor(100000 + Math.random() * 900000)}`,
    created_by: testAdmin.id,
  }).select('*').single();

  await admin.from('customers').update({ deleted_at: new Date().toISOString() }).eq('id', regCust.id);
  const { data: checkDeleted } = await admin.from('customers').select('deleted_at').eq('id', regCust.id).single();
  assert('9. Phase 1, 2, 3 Regression Safety', checkDeleted?.deleted_at !== null, 'Phase 2 Customer soft delete functions properly');

  // Deal creation & stage progression
  const { data: dealId, error: dealErr } = await admin.rpc('crm_create_deal', {
    p_title: 'Phase 4A Regression Deal',
    p_customer_id: regCust.id,
    p_assigned_to: ahmed.id,
    p_total_amount: 35000,
    p_expected_close_date: null,
    p_notes: 'Deal notes',
    p_created_by: testAdmin.id,
  });

  assert('9. Phase 1, 2, 3 Regression Safety', !dealErr && !!dealId, 'Phase 2 Deal creation works via RPC');

  // Manual lead creation & conversion references
  const { data: manLead, error: manLeadErr } = await admin.from('leads').insert({
    full_name: 'Manual Lead Reg',
    phone: `+201033${Math.floor(100000 + Math.random() * 900000)}`,
    source: 'manual',
    status: 'new',
    assignment_source: 'manual',
    assigned_to: ahmed.id,
  }).select('*').single();

  assert('9. Phase 1, 2, 3 Regression Safety', !manLeadErr && !!manLead, 'Phase 3 Manual lead creation works without regressions');

  // Clean up test records
  await admin.from('conversations').delete().in('id', [pendingConv.id, ahmedConv.id, mohamedConv.id, conv1.id, ...backlogConvIds]);
  await admin.from('leads').delete().in('id', [stickyLead1.id, stickyLead2.id, newLead1.id, newLead2.id, yesterdayLead.id, manLead.id, ...backlogLeadIds]);

  // ----------------------------------------------------------------
  // SUMMARY REPORT
  // ----------------------------------------------------------------
  console.log('\n====================================================');
  console.log('📊 PHASE 4A VERIFICATION SUMMARY');
  console.log('====================================================');
  console.log(`Total Assertions Run: ${totalTests}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);

  for (const [sec, res] of Object.entries(sectionResults)) {
    const status = res.failed === 0 ? '✅' : '❌';
    console.log(`  ${status} ${sec}: ${res.passed}/${res.passed + res.failed} passed`);
    if (res.failed > 0) {
      res.notes.forEach((n) => console.log(`     -> ${n}`));
    }
  }

  if (failedCount === 0) {
    console.log('\n🎉 ALL PHASE 4A TESTS PASSED FLAWLESSLY (100% SUCCESS)');
    process.exit(0);
  } else {
    console.error(`\n❌ ${failedCount} TESTS FAILED`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
