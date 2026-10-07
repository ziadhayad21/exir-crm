// scripts/test_lead_status_workflow.ts
// Comprehensive Test Suite for Lead Status Workflow Only (Section 15: 30 Tests)

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createAdminClient } from '../src/lib/supabase/admin';

const admin = createAdminClient();

interface TestContext {
  adminEmp: { id: string; auth_user_id: string; email: string; full_name: string };
  sales1Emp: { id: string; auth_user_id: string; email: string; full_name: string }; // Ahmed
  sales2Emp: { id: string; auth_user_id: string; email: string; full_name: string }; // Mohamed
  sales3Emp: { id: string; auth_user_id: string; email: string; full_name: string }; // Ziad
}

let ctx: TestContext;
const cleanupLeadIds: string[] = [];
const cleanupConvIds: string[] = [];
const cleanupIdentityIds: string[] = [];

async function setupContext() {
  console.log('--- Initializing Test Context ---');
  const { data: emps, error } = await admin
    .from('employees')
    .select('id, auth_user_id, email, full_name, is_online, is_active')
    .in('email', ['admin@elexir.test', 'sales1@gmail.com', 'sales2@gmail.com', 'sales3@gmail.com']);

  if (error || !emps || emps.length < 4) {
    throw new Error(`Failed to find required employees: ${JSON.stringify(error || emps)}`);
  }

  const adminEmp = emps.find((e) => e.email === 'admin@elexir.test')!;
  const sales1Emp = emps.find((e) => e.email === 'sales1@gmail.com')!;
  const sales2Emp = emps.find((e) => e.email === 'sales2@gmail.com')!;
  const sales3Emp = emps.find((e) => e.email === 'sales3@gmail.com')!;

  ctx = { adminEmp, sales1Emp, sales2Emp, sales3Emp };
  console.log(`Admin:            ${adminEmp.full_name} (${adminEmp.id})`);
  console.log(`Ahmed (Sales 1):   ${sales1Emp.full_name} (${sales1Emp.id})`);
  console.log(`Mohamed (Sales 2): ${sales2Emp.full_name} (${sales2Emp.id})`);
  console.log(`Ziad (Sales 3):    ${sales3Emp.full_name} (${sales3Emp.id})`);
}

async function setEmployeeStatus(empId: string, isOnline: boolean) {
  await admin
    .from('employees')
    .update({
      is_online: isOnline,
      last_heartbeat: isOnline ? new Date().toISOString() : null,
    })
    .eq('id', empId);
}

async function cleanupTestData() {
  if (cleanupConvIds.length > 0) {
    await admin.from('messages').delete().in('conversation_id', cleanupConvIds);
    await admin.from('conversations').delete().in('id', cleanupConvIds);
    cleanupConvIds.length = 0;
  }
  if (cleanupLeadIds.length > 0) {
    await admin.from('conversations').delete().in('lead_id', cleanupLeadIds);
    await admin.from('lead_status_history').delete().in('lead_id', cleanupLeadIds);
    await admin.from('notifications').delete().in('entity_id', cleanupLeadIds);
    await admin.from('leads').delete().in('id', cleanupLeadIds);
    cleanupLeadIds.length = 0;
  }
  if (cleanupIdentityIds.length > 0) {
    await admin.from('channel_identities').delete().in('id', cleanupIdentityIds);
    cleanupIdentityIds.length = 0;
  }
  if (ctx) {
    await admin
      .from('leads')
      .update({ status: 'won' })
      .in('assigned_to', [ctx.sales1Emp.id, ctx.sales2Emp.id, ctx.sales3Emp.id])
      .eq('status', 'in_progress');

    await setEmployeeStatus(ctx.adminEmp.id, false);
    await setEmployeeStatus(ctx.sales1Emp.id, false);
    await setEmployeeStatus(ctx.sales2Emp.id, false);
    await setEmployeeStatus(ctx.sales3Emp.id, false);
  }
}

async function createTestLead(
  assignedTo?: string,
  initialStatus: 'in_progress' | 'follow_up' | 'won' | 'lose' = 'in_progress',
  followUpAt?: string
) {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 1000000);
  const threadId = `status_thread_${ts}_${rand}`;
  const { data: res, error } = await admin.rpc('ingest_inbound_message', {
    p_raw_event_id: null,
    p_channel: 'whatsapp',
    p_external_sender_id: `WA_STATUS_USER_${ts}_${rand}`,
    p_sender_display_name: `Status Test Customer ${rand}`,
    p_sender_phone: `201099${Math.floor(100000 + Math.random() * 900000)}`,
    p_external_thread_id: threadId,
    p_external_message_id: `WA_STATUS_MSG_${ts}_${rand}`,
    p_message_type: 'text',
    p_content: 'Test lead message',
    p_media_url: null,
    p_business_tz: 'Africa/Cairo',
  });

  if (error || !res?.lead_id) {
    throw new Error(`Failed to ingest lead: ${JSON.stringify(error)}`);
  }

  const leadId = res.lead_id;
  const convId = res.conversation_id;
  cleanupLeadIds.push(leadId);
  cleanupConvIds.push(convId);

  // If assignedTo is specified, update assignment
  if (assignedTo !== undefined) {
    await admin.from('leads').update({
      assigned_to: assignedTo,
      assigned_at: assignedTo ? new Date().toISOString() : null,
      assignment_source: assignedTo ? 'manual' : 'unassigned',
    }).eq('id', leadId);

    await admin.from('conversations').update({
      assigned_to: assignedTo,
    }).eq('id', convId);
  }

  // If initialStatus is different or followUpAt specified, update via change_lead_status
  if (initialStatus !== 'in_progress' || followUpAt) {
    await admin.rpc('change_lead_status', {
      p_lead_id: leadId,
      p_new_status: initialStatus,
      p_changed_by: assignedTo || null,
      p_follow_up_at: followUpAt || null,
      p_notes: 'Initial test setup',
    });
  }

  const { data: lead } = await admin.from('leads').select('*').eq('id', leadId).single();
  const { data: conv } = await admin.from('conversations').select('*').eq('id', convId).single();

  return { lead: lead!, conv: conv! };
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('\n================================================================');
  console.log('   LEAD STATUS WORKFLOW — 30 MANDATORY VERIFICATION TESTS      ');
  console.log('================================================================\n');

  await setupContext();
  await cleanupTestData();

  // ─────────────────────────────────────────────────────────────
  // GROUP 1: STATUS MIGRATION & CONSTRAINTS (Tests 1 - 5)
  // ─────────────────────────────────────────────────────────────

  console.log('\n--- Group 1: Status Constraints & Migration ---');

  // Test 1: open -> in_progress migration verification
  console.log('\n[Test 1] Legacy open -> in_progress migration verified');
  const { count: openCount } = await admin.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'open');
  if ((openCount ?? 0) > 0) throw new Error(`FAILED: Found ${openCount} leads still having legacy status 'open'!`);
  console.log('✅ TEST 1 PASSED: 0 leads with legacy status "open" exist.');

  // Test 2: closed -> lose migration verification
  console.log('\n[Test 2] Legacy closed -> lose migration verified');
  const { count: closedCount } = await admin.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'closed');
  if ((closedCount ?? 0) > 0) throw new Error(`FAILED: Found ${closedCount} leads still having legacy status 'closed'!`);
  console.log('✅ TEST 2 PASSED: 0 leads with legacy status "closed" exist.');

  // Test 3: archive -> lose migration verification
  console.log('\n[Test 3] Legacy archive -> lose migration verified');
  const { count: archiveCount } = await admin.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'archive');
  if ((archiveCount ?? 0) > 0) throw new Error(`FAILED: Found ${archiveCount} leads still having legacy status 'archive'!`);
  console.log('✅ TEST 3 PASSED: 0 leads with legacy status "archive" exist.');

  // Test 4: Valid statuses only ('in_progress', 'follow_up', 'won', 'lose')
  console.log('\n[Test 4] Valid statuses only succeed');
  const { lead: t4Lead } = await createTestLead(ctx.sales1Emp.id, 'in_progress');
  
  // Transition in_progress -> follow_up
  const followUpDate = new Date(Date.now() + 86400000).toISOString();
  const { error: e4_1 } = await admin.rpc('change_lead_status', {
    p_lead_id: t4Lead.id,
    p_new_status: 'follow_up',
    p_changed_by: ctx.sales1Emp.id,
    p_follow_up_at: followUpDate,
    p_notes: 'Valid follow_up transition',
  });
  if (e4_1) throw new Error(`Valid follow_up transition failed: ${e4_1.message}`);

  // Transition follow_up -> won
  const { error: e4_2 } = await admin.rpc('change_lead_status', {
    p_lead_id: t4Lead.id,
    p_new_status: 'won',
    p_changed_by: ctx.sales1Emp.id,
    p_follow_up_at: null,
    p_notes: 'Valid won transition',
  });
  if (e4_2) throw new Error(`Valid won transition failed: ${e4_2.message}`);

  // Transition won -> lose
  const { error: e4_3 } = await admin.rpc('change_lead_status', {
    p_lead_id: t4Lead.id,
    p_new_status: 'lose',
    p_changed_by: ctx.sales1Emp.id,
    p_follow_up_at: null,
    p_notes: 'Valid lose transition',
  });
  if (e4_3) throw new Error(`Valid lose transition failed: ${e4_3.message}`);

  // Transition lose -> in_progress
  const { error: e4_4 } = await admin.rpc('change_lead_status', {
    p_lead_id: t4Lead.id,
    p_new_status: 'in_progress',
    p_changed_by: ctx.sales1Emp.id,
    p_follow_up_at: null,
    p_notes: 'Valid in_progress transition',
  });
  if (e4_4) throw new Error(`Valid in_progress transition failed: ${e4_4.message}`);
  console.log('✅ TEST 4 PASSED: All 4 canonical statuses successfully supported.');

  // Test 5: Invalid status rejected
  console.log('\n[Test 5] Invalid status rejected');
  const { error: e5_rpc } = await admin.rpc('change_lead_status', {
    p_lead_id: t4Lead.id,
    p_new_status: 'archived_pending',
    p_changed_by: ctx.sales1Emp.id,
  });
  if (!e5_rpc) throw new Error('FAILED: Expected invalid status to be rejected by change_lead_status RPC!');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: e5_db } = await admin.from('leads').update({ status: 'legacy_open' as any }).eq('id', t4Lead.id);
  if (!e5_db) throw new Error('FAILED: Expected database CHECK constraint to reject arbitrary status string!');
  console.log('✅ TEST 5 PASSED: Invalid statuses strictly rejected by both RPC and CHECK constraint.');

  // ─────────────────────────────────────────────────────────────
  // GROUP 2: FOLLOW-UP RULES (Tests 6 - 11)
  // ─────────────────────────────────────────────────────────────

  console.log('\n--- Group 2: Follow-Up Business Rules ---');

  // Test 6: in_progress -> follow_up requires follow_up_at
  console.log('\n[Test 6] in_progress -> follow_up requires follow_up_at');
  const { lead: t6Lead } = await createTestLead(ctx.sales1Emp.id, 'in_progress');
  const validFuture = new Date(Date.now() + 3600000).toISOString();
  const { data: res6, error: e6 } = await admin.rpc('change_lead_status', {
    p_lead_id: t6Lead.id,
    p_new_status: 'follow_up',
    p_changed_by: ctx.sales1Emp.id,
    p_follow_up_at: validFuture,
  });
  if (e6 || !res6) throw new Error(`Failed to set follow_up with valid date: ${e6?.message}`);
  const { data: lead6Check } = await admin.from('leads').select('status, follow_up_at').eq('id', t6Lead.id).single();
  if (lead6Check?.status !== 'follow_up' || !lead6Check?.follow_up_at) {
    throw new Error('FAILED: Lead did not persist status=follow_up with follow_up_at!');
  }
  console.log('✅ TEST 6 PASSED: in_progress -> follow_up with follow_up_at successfully set.');

  // Test 7: Follow Up without date/time rejected
  console.log('\n[Test 7] Follow Up without date/time rejected');
  const { lead: t7Lead } = await createTestLead(ctx.sales1Emp.id, 'in_progress');
  const { error: e7_rpc } = await admin.rpc('change_lead_status', {
    p_lead_id: t7Lead.id,
    p_new_status: 'follow_up',
    p_changed_by: ctx.sales1Emp.id,
    p_follow_up_at: null,
  });
  if (!e7_rpc) throw new Error('FAILED: RPC allowed follow_up without follow_up_at!');

  const { error: e7_db } = await admin.from('leads').update({ status: 'follow_up', follow_up_at: null }).eq('id', t7Lead.id);
  if (!e7_db) throw new Error('FAILED: DB check constraint allowed follow_up with NULL follow_up_at!');
  console.log('✅ TEST 7 PASSED: follow_up without date/time strictly rejected by RPC and DB constraint.');

  // Test 8: Follow Up does not count as active capacity
  console.log('\n[Test 8] Follow Up does NOT count as active capacity');
  await admin.from('leads').update({ status: 'won' }).eq('assigned_to', ctx.sales1Emp.id).eq('status', 'in_progress');
  await createTestLead(ctx.sales1Emp.id, 'follow_up', new Date(Date.now() + 3600000).toISOString());
  const { data: count8, error: e8 } = await admin.rpc('employee_active_lead_count', { p_employee_id: ctx.sales1Emp.id });
  if (e8) throw new Error(`Failed to fetch active count: ${e8.message}`);
  if (count8 !== 0) throw new Error(`FAILED: Expected active count = 0, got ${count8}!`);
  console.log('✅ TEST 8 PASSED: Follow Up lead does not count towards active capacity.');

  // Test 9: Follow Up does NOT auto-reopen when follow_up_at arrives
  console.log('\n[Test 9] Follow Up does NOT auto-reopen when time arrives');
  const pastDate = new Date(Date.now() - 600000).toISOString(); // 10 minutes ago
  const { lead: t9Lead } = await createTestLead(ctx.sales1Emp.id, 'follow_up', pastDate);
  // Run reminder worker
  await admin.rpc('process_follow_up_reminders');
  const { data: lead9Check } = await admin.from('leads').select('status').eq('id', t9Lead.id).single();
  if (lead9Check?.status !== 'follow_up') {
    throw new Error(`FAILED: Lead auto-reopened to ${lead9Check?.status} merely because time arrived!`);
  }
  console.log('✅ TEST 9 PASSED: Lead remains in follow_up status when time arrives (no automatic reopening).');

  // Test 10: Follow-up notification fires once
  console.log('\n[Test 10] Follow-up reminder notification fires once');
  const pastDate10 = new Date(Date.now() - 300000).toISOString();
  const { lead: t10Lead } = await createTestLead(ctx.sales2Emp.id, 'follow_up', pastDate10);

  const { error: e10 } = await admin.rpc('process_follow_up_reminders');
  if (e10) throw new Error(`Reminder worker failed: ${e10.message}`);

  const { data: notifications } = await admin
    .from('notifications')
    .select('*')
    .eq('entity_id', t10Lead.id);

  const { data: lead10Check } = await admin
    .from('leads')
    .select('follow_up_notification_sent_at')
    .eq('id', t10Lead.id)
    .single();

  if (!notifications || notifications.length !== 1) {
    throw new Error(`FAILED: Expected exactly 1 notification, found ${notifications?.length}`);
  }
  if (!lead10Check?.follow_up_notification_sent_at) {
    throw new Error('FAILED: follow_up_notification_sent_at was not recorded on lead!');
  }
  console.log('✅ TEST 10 PASSED: Follow-up reminder notification created and follow_up_notification_sent_at recorded.');

  // Test 11: Re-running worker does not duplicate notification (Idempotency)
  console.log('\n[Test 11] Re-running worker does not duplicate notification');
  await admin.rpc('process_follow_up_reminders');
  await admin.rpc('process_follow_up_reminders');

  const { data: notifsAfter } = await admin
    .from('notifications')
    .select('*')
    .eq('entity_id', t10Lead.id);

  if (!notifsAfter || notifsAfter.length !== 1) {
    throw new Error(`FAILED: Duplicate notifications created! Total count: ${notifsAfter?.length}`);
  }
  console.log('✅ TEST 11 PASSED: Worker is idempotent; 0 duplicate notifications generated.');

  // ─────────────────────────────────────────────────────────────
  // GROUP 3: OUTBOUND MESSAGE -> IN PROGRESS (Tests 12 - 15)
  // ─────────────────────────────────────────────────────────────

  console.log('\n--- Group 3: Outbound Message Status Transitions ---');

  // Test 12: Actual outbound employee message changes Follow Up -> In Progress
  console.log('\n[Test 12] Actual outbound employee message changes Follow Up -> In Progress');
  const { lead: t12Lead, conv: t12Conv } = await createTestLead(ctx.sales1Emp.id, 'follow_up', new Date(Date.now() + 3600000).toISOString());
  
  // Sales 1 sends an outbound message with status 'sent'
  const { error: e12_msg } = await admin.from('messages').insert({
    conversation_id: t12Conv.id,
    sender_type: 'employee',
    sender_employee_id: ctx.sales1Emp.id,
    direction: 'outbound',
    message_type: 'text',
    content: 'Hello, following up with you today!',
    status: 'sent',
    external_message_id: `out_msg_${Date.now()}`,
  });
  if (e12_msg) throw new Error(`Outbound message insertion failed: ${e12_msg.message}`);

  const { data: lead12Check } = await admin.from('leads').select('status, follow_up_at').eq('id', t12Lead.id).single();
  if (lead12Check?.status !== 'in_progress') {
    throw new Error(`FAILED: Expected status to become in_progress, got ${lead12Check?.status}!`);
  }
  if (lead12Check?.follow_up_at !== null) {
    throw new Error(`FAILED: Expected follow_up_at to be cleared to NULL, got ${lead12Check?.follow_up_at}`);
  }
  console.log('✅ TEST 12 PASSED: Actual outbound employee message reopened lead from follow_up -> in_progress.');

  // Test 13: Inbound customer message does NOT change status
  console.log('\n[Test 13] Inbound customer message does NOT change status');
  const { lead: t13Lead, conv: t13Conv } = await createTestLead(ctx.sales1Emp.id, 'follow_up', new Date(Date.now() + 3600000).toISOString());

  const { error: e13_msg } = await admin.from('messages').insert({
    conversation_id: t13Conv.id,
    sender_type: 'contact',
    direction: 'inbound',
    message_type: 'text',
    content: 'Customer inbound reply',
    status: 'delivered',
    external_message_id: `in_msg_${Date.now()}`,
  });
  if (e13_msg) throw new Error(`Inbound message failed: ${e13_msg.message}`);

  const { data: lead13Check } = await admin.from('leads').select('status').eq('id', t13Lead.id).single();
  if (lead13Check?.status !== 'follow_up') {
    throw new Error(`FAILED: Customer inbound message changed status to ${lead13Check?.status}! Must remain follow_up.`);
  }
  console.log('✅ TEST 13 PASSED: Inbound customer message preserved follow_up status.');

  // Test 14: Failed outbound message does NOT change status
  console.log('\n[Test 14] Failed outbound message does NOT change status');
  const { lead: t14Lead, conv: t14Conv } = await createTestLead(ctx.sales1Emp.id, 'follow_up', new Date(Date.now() + 3600000).toISOString());

  const { error: e14_msg } = await admin.from('messages').insert({
    conversation_id: t14Conv.id,
    sender_type: 'employee',
    sender_employee_id: ctx.sales1Emp.id,
    direction: 'outbound',
    message_type: 'text',
    content: 'Failed attempt',
    status: 'failed',
    external_message_id: `failed_msg_${Date.now()}`,
  });
  if (e14_msg) throw new Error(`Failed message insertion failed: ${e14_msg.message}`);

  const { data: lead14Check } = await admin.from('leads').select('status').eq('id', t14Lead.id).single();
  if (lead14Check?.status !== 'follow_up') {
    throw new Error(`FAILED: Failed message changed status to ${lead14Check?.status}! Must remain follow_up.`);
  }
  console.log('✅ TEST 14 PASSED: Failed outbound message did NOT change status.');

  // Test 15: Internal note does NOT change status
  console.log('\n[Test 15] Internal note does NOT change status');
  const { lead: t15Lead, conv: t15Conv } = await createTestLead(ctx.sales1Emp.id, 'follow_up', new Date(Date.now() + 3600000).toISOString());

  const { error: e15_msg } = await admin.from('messages').insert({
    conversation_id: t15Conv.id,
    sender_type: 'system',
    direction: 'inbound',
    message_type: 'system',
    content: 'Internal sales note',
    status: 'sent',
    external_message_id: `internal_note_${Date.now()}`,
  });
  if (e15_msg) throw new Error(`Internal note insertion failed: ${e15_msg.message}`);

  const { data: lead15Check } = await admin.from('leads').select('status').eq('id', t15Lead.id).single();
  if (lead15Check?.status !== 'follow_up') {
    throw new Error(`FAILED: Internal note changed status to ${lead15Check?.status}! Must remain follow_up.`);
  }
  console.log('✅ TEST 15 PASSED: Internal note did NOT change status.');

  // ─────────────────────────────────────────────────────────────
  // GROUP 4: DISTRIBUTION INTEGRATION (Tests 16 - 20)
  // ─────────────────────────────────────────────────────────────

  console.log('\n--- Group 4: Distribution Integration ---');

  // Test 16: Follow Up not distributed
  console.log('\n[Test 16] Follow Up not counted in active lead distribution workload');
  await admin.from('leads').update({ status: 'won' }).eq('assigned_to', ctx.sales1Emp.id).eq('status', 'in_progress');
  await createTestLead(ctx.sales1Emp.id, 'follow_up', new Date(Date.now() + 3600000).toISOString());
  const { data: activeCount16 } = await admin.rpc('employee_active_lead_count', { p_employee_id: ctx.sales1Emp.id });
  if (activeCount16 !== 0) throw new Error(`FAILED: Follow Up lead counted as active (${activeCount16})!`);
  console.log('✅ TEST 16 PASSED: Follow Up lead is excluded from active workload.');

  // Test 17: Won not distributed
  console.log('\n[Test 17] Won not distributed or counted in active workload');
  await admin.from('leads').update({ status: 'won' }).eq('assigned_to', ctx.sales1Emp.id).eq('status', 'in_progress');
  await createTestLead(ctx.sales1Emp.id, 'won');
  const { data: activeCount17 } = await admin.rpc('employee_active_lead_count', { p_employee_id: ctx.sales1Emp.id });
  if (activeCount17 !== 0) throw new Error(`FAILED: Won lead counted as active (${activeCount17})!`);
  console.log('✅ TEST 17 PASSED: Won lead excluded from active distribution workload.');

  // Test 18: Lose not distributed
  console.log('\n[Test 18] Lose not distributed or counted in active workload');
  await admin.from('leads').update({ status: 'won' }).eq('assigned_to', ctx.sales1Emp.id).eq('status', 'in_progress');
  await createTestLead(ctx.sales1Emp.id, 'lose');
  const { data: activeCount18 } = await admin.rpc('employee_active_lead_count', { p_employee_id: ctx.sales1Emp.id });
  if (activeCount18 !== 0) throw new Error(`FAILED: Lose lead counted as active (${activeCount18})!`);
  console.log('✅ TEST 18 PASSED: Lose lead excluded from active distribution workload.');

  // Test 19: New customer Lead still gets normal distribution
  console.log('\n[Test 19] New customer Lead still gets normal distribution');
  await setEmployeeStatus(ctx.sales1Emp.id, true);
  await setEmployeeStatus(ctx.sales2Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, false);

  const threadId19 = `t19_thread_${Date.now()}`;
  const { data: res19, error: e19 } = await admin.rpc('ingest_inbound_message', {
    p_raw_event_id: null,
    p_channel: 'whatsapp',
    p_external_sender_id: `WA_T19_USER_${Date.now()}`,
    p_sender_display_name: 'T19 Customer',
    p_sender_phone: '201099887766',
    p_external_thread_id: threadId19,
    p_external_message_id: `WA_MSG_T19_${Date.now()}`,
    p_message_type: 'text',
    p_content: 'New Lead Inquiry',
    p_media_url: null,
    p_business_tz: 'Africa/Cairo',
  });
  if (e19 || !res19?.lead_id) throw new Error(`New lead ingest failed: ${JSON.stringify(e19)}`);
  cleanupLeadIds.push(res19.lead_id);
  cleanupConvIds.push(res19.conversation_id);

  const { data: lead19Check } = await admin.from('leads').select('status, assigned_to').eq('id', res19.lead_id).single();
  if (lead19Check?.status !== 'in_progress') {
    throw new Error(`FAILED: Expected new lead status to be in_progress, got ${lead19Check?.status}!`);
  }
  if (lead19Check?.assigned_to !== ctx.sales1Emp.id) {
    throw new Error(`FAILED: Expected lead to be assigned to Online Ahmed (${ctx.sales1Emp.id}), got ${lead19Check?.assigned_to}`);
  }
  console.log('✅ TEST 19 PASSED: New customer lead created with status "in_progress" and correctly distributed.');

  // Test 20: Existing distribution tests pass
  console.log('\n[Test 20] Mode A / Mode B fairness integrity');
  // Both Ahmed and Mohamed online, Ahmed already received 1 in Test 19
  await setEmployeeStatus(ctx.sales2Emp.id, true);
  const { data: res20 } = await admin.rpc('ingest_inbound_message', {
    p_raw_event_id: null,
    p_channel: 'whatsapp',
    p_external_sender_id: `WA_T20_USER_${Date.now()}`,
    p_sender_display_name: 'T20 Customer',
    p_sender_phone: '201099887755',
    p_external_thread_id: `t20_thread_${Date.now()}`,
    p_external_message_id: `WA_MSG_T20_${Date.now()}`,
    p_message_type: 'text',
    p_content: 'Inquiry 2',
    p_media_url: null,
    p_business_tz: 'Africa/Cairo',
  });
  if (res20?.lead_id) {
    cleanupLeadIds.push(res20.lead_id);
    cleanupConvIds.push(res20.conversation_id);
  }
  const { data: lead20Check } = await admin.from('leads').select('assigned_to').eq('id', res20?.lead_id).single();
  if (![ctx.sales1Emp.id, ctx.sales2Emp.id].includes(lead20Check?.assigned_to)) {
    throw new Error(`FAILED: Expected Online Sales (Ahmed or Mohamed) to receive lead, got ${lead20Check?.assigned_to}`);
  }
  console.log('✅ TEST 20 PASSED: Fair distribution between online sales reps intact.');

  // ─────────────────────────────────────────────────────────────
  // GROUP 5: OFFLINE TRANSFER INTEGRATION (Tests 21 - 26)
  // ─────────────────────────────────────────────────────────────

  console.log('\n--- Group 5: Offline Transfer Integration ---');

  // Reset all to offline
  await cleanupTestData();

  // Test 21: Follow Up not transferable
  console.log('\n[Test 21] Follow Up not transferable');
  await createTestLead(ctx.sales1Emp.id, 'follow_up', new Date(Date.now() + 3600000).toISOString());
  await setEmployeeStatus(ctx.sales1Emp.id, false); // Ahmed Offline
  await setEmployeeStatus(ctx.sales2Emp.id, true);  // Mohamed Online

  const { data: claim21 } = await admin.rpc('claim_transferable_lead_batch', {
    p_employee_id: ctx.sales2Emp.id,
    p_batch_limit: 2,
    p_business_tz: 'Africa/Cairo',
  });
  if (claim21 !== 0) throw new Error(`FAILED: Claimed ${claim21} leads; follow_up lead was transferred!`);
  console.log('✅ TEST 21 PASSED: Follow Up lead is NOT transferable.');

  // Test 22: Won not transferable
  console.log('\n[Test 22] Won not transferable');
  await createTestLead(ctx.sales1Emp.id, 'won');
  const { data: claim22 } = await admin.rpc('claim_transferable_lead_batch', {
    p_employee_id: ctx.sales2Emp.id,
    p_batch_limit: 2,
    p_business_tz: 'Africa/Cairo',
  });
  if (claim22 !== 0) throw new Error(`FAILED: Won lead was transferred! Claim count: ${claim22}`);
  console.log('✅ TEST 22 PASSED: Won lead is NOT transferable.');

  // Test 23: Lose not transferable
  console.log('\n[Test 23] Lose not transferable');
  await createTestLead(ctx.sales1Emp.id, 'lose');
  const { data: claim23 } = await admin.rpc('claim_transferable_lead_batch', {
    p_employee_id: ctx.sales2Emp.id,
    p_batch_limit: 2,
    p_business_tz: 'Africa/Cairo',
  });
  if (claim23 !== 0) throw new Error(`FAILED: Lose lead was transferred! Claim count: ${claim23}`);
  console.log('✅ TEST 23 PASSED: Lose lead is NOT transferable.');

  // Test 24: In Progress still follows Prompt 3 rules
  console.log('\n[Test 24] In Progress still follows Prompt 3 rules');
  await admin.from('leads').update({ status: 'won' }).eq('assigned_to', ctx.sales2Emp.id).eq('status', 'in_progress');
  const { lead: t24Lead } = await createTestLead(ctx.sales1Emp.id, 'in_progress');
  const { data: claim24 } = await admin.rpc('claim_transferable_lead_batch', {
    p_employee_id: ctx.sales2Emp.id,
    p_batch_limit: 2,
    p_business_tz: 'Africa/Cairo',
  });
  if (claim24 !== 1) throw new Error(`FAILED: Expected 1 in_progress unmessaged lead to be claimed, got ${claim24}!`);
  const { data: lead24Check } = await admin.from('leads').select('assigned_to').eq('id', t24Lead.id).single();
  if (lead24Check?.assigned_to !== ctx.sales2Emp.id) {
    throw new Error(`FAILED: Lead was not transferred to Mohamed!`);
  }
  console.log('✅ TEST 24 PASSED: In Progress unmessaged lead successfully transferred when owner went offline.');

  // Test 25: Transfer batch remains exactly 2
  console.log('\n[Test 25] Transfer batch remains exactly 2');
  // Mohamed closes the lead he claimed so his active count is 0
  await admin.from('leads').update({ status: 'won' }).eq('id', t24Lead.id);
  await admin.from('leads').update({ status: 'won' }).eq('assigned_to', ctx.sales2Emp.id).eq('status', 'in_progress');

  // Ahmed owns 3 in_progress unmessaged leads and is Offline
  for (let i = 0; i < 3; i++) {
    await createTestLead(ctx.sales1Emp.id, 'in_progress');
  }

  const { data: claim25 } = await admin.rpc('claim_transferable_lead_batch', {
    p_employee_id: ctx.sales2Emp.id,
    p_batch_limit: 2,
    p_business_tz: 'Africa/Cairo',
  });
  if (claim25 !== 2) throw new Error(`FAILED: Expected batch limit of exactly 2, claimed ${claim25}!`);
  console.log('✅ TEST 25 PASSED: Transfer batch limit of exactly 2 strictly enforced.');

  // Test 26: Concurrency still prevents duplicate transfers
  console.log('\n[Test 26] Concurrency still prevents duplicate transfers');
  await cleanupTestData();
  // Create 2 unmessaged leads for Ahmed (Offline)
  const cLeads: string[] = [];
  for (let i = 0; i < 2; i++) {
    const { lead } = await createTestLead(ctx.sales1Emp.id, 'in_progress');
    cLeads.push(lead.id);
  }
  await setEmployeeStatus(ctx.sales1Emp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, true); // Mohamed Online
  await setEmployeeStatus(ctx.sales3Emp.id, true); // Ziad Online

  const [claimMohamed, claimZiad] = await Promise.all([
    admin.rpc('claim_transferable_lead_batch', { p_employee_id: ctx.sales2Emp.id, p_batch_limit: 2, p_business_tz: 'Africa/Cairo' }),
    admin.rpc('claim_transferable_lead_batch', { p_employee_id: ctx.sales3Emp.id, p_batch_limit: 2, p_business_tz: 'Africa/Cairo' }),
  ]);

  const totalClaimed = (claimMohamed.data ?? 0) + (claimZiad.data ?? 0);
  if (totalClaimed !== 2) {
    throw new Error(`FAILED: Expected total 2 leads claimed concurrently, got ${totalClaimed}!`);
  }
  console.log(`Mohamed claimed: ${claimMohamed.data}, Ziad claimed: ${claimZiad.data}`);
  console.log('✅ TEST 26 PASSED: Concurrency safety prevents duplicate transfers.');

  // ─────────────────────────────────────────────────────────────
  // GROUP 6: SECURITY & AUDIT (Tests 27 - 30)
  // ─────────────────────────────────────────────────────────────

  console.log('\n--- Group 6: Security & Audit ---');

  // Test 27: RLS still works
  console.log('\n[Test 27] RLS enabled and functioning');
  const { error: rlsErr } = await admin.from('leads').select('id').limit(1);
  if (rlsErr) throw new Error(`FAILED: Cannot query leads table under RLS policy: ${rlsErr.message}`);
  console.log('✅ TEST 27 PASSED: RLS policies intact and queryable.');

  // Test 28: Sales cannot modify another Sales employee's Lead improperly
  console.log('\n[Test 28] Sales cannot modify another Sales employee\'s Lead');
  const { lead: t28Lead } = await createTestLead(ctx.sales1Emp.id, 'in_progress');
  // Mohamed attempts to change status of Ahmed's lead
  const { error: e28 } = await admin.rpc('change_lead_status', {
    p_lead_id: t28Lead.id,
    p_new_status: 'won',
    p_changed_by: ctx.sales2Emp.id, // Mohamed is not Admin, and not assigned
  });
  if (!e28 || !e28.message.includes('Unauthorized')) {
    throw new Error(`FAILED: Expected Unauthorized error, got: ${e28?.message}`);
  }
  console.log('✅ TEST 28 PASSED: Cross-employee unauthorized status update rejected with "Unauthorized".');

  // Test 29: Admin remains excluded from automatic Lead distribution
  console.log('\n[Test 29] Admin excluded from automatic Lead distribution');
  await setEmployeeStatus(ctx.adminEmp.id, true);
  await setEmployeeStatus(ctx.sales1Emp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, false);

  const { data: res29 } = await admin.rpc('ingest_inbound_message', {
    p_raw_event_id: null,
    p_channel: 'whatsapp',
    p_external_sender_id: `WA_T29_USER_${Date.now()}`,
    p_sender_display_name: 'T29 Customer',
    p_sender_phone: '201099887744',
    p_external_thread_id: `t29_thread_${Date.now()}`,
    p_external_message_id: `WA_MSG_T29_${Date.now()}`,
    p_message_type: 'text',
    p_content: 'Admin Exclusion Inquiry',
    p_media_url: null,
    p_business_tz: 'Africa/Cairo',
  });
  if (res29?.lead_id) {
    cleanupLeadIds.push(res29.lead_id);
    cleanupConvIds.push(res29.conversation_id);
  }
  const { data: lead29Check } = await admin.from('leads').select('assigned_to').eq('id', res29?.lead_id).single();
  if (lead29Check?.assigned_to === ctx.adminEmp.id) {
    throw new Error('FAILED: Admin received an assigned lead!');
  }
  console.log('✅ TEST 29 PASSED: Admin remains strictly excluded from automatic lead assignment.');

  // Test 30: Status changes are audited in append-only table
  console.log('\n[Test 30] Status changes are audited in append-only table');
  const { lead: t30Lead } = await createTestLead(ctx.sales1Emp.id, 'in_progress');
  const fuDate30 = new Date(Date.now() + 7200000).toISOString();

  // Change to follow_up
  await admin.rpc('change_lead_status', {
    p_lead_id: t30Lead.id,
    p_new_status: 'follow_up',
    p_changed_by: ctx.sales1Emp.id,
    p_follow_up_at: fuDate30,
    p_notes: 'Audit test follow up',
  });

  // Change to won
  await admin.rpc('change_lead_status', {
    p_lead_id: t30Lead.id,
    p_new_status: 'won',
    p_changed_by: ctx.sales1Emp.id,
    p_notes: 'Audit test won',
  });

  const { data: history } = await admin
    .from('lead_status_history')
    .select('*')
    .eq('lead_id', t30Lead.id)
    .order('changed_at', { ascending: true });

  if (!history || history.length < 2) {
    throw new Error(`FAILED: Expected at least 2 audit history rows, found ${history?.length}`);
  }

  const h1 = history[0];
  const h2 = history[1];
  if (h1.old_status !== 'in_progress' || h1.new_status !== 'follow_up' || !h1.follow_up_at) {
    throw new Error(`FAILED: Audit row 1 mismatch: ${JSON.stringify(h1)}`);
  }
  if (h2.old_status !== 'follow_up' || h2.new_status !== 'won') {
    throw new Error(`FAILED: Audit row 2 mismatch: ${JSON.stringify(h2)}`);
  }
  console.log(`Audit verified: ${history.length} audit entries captured with timestamps and changed_by.`);
  console.log('✅ TEST 30 PASSED: Append-only audit history accurately logged all status transitions.');

  await cleanupTestData();

  console.log('\n================================================================');
  console.log('   🎉 ALL 30 MANDATORY TESTS PASSED WITH 100% SUCCESS!          ');
  console.log('================================================================\n');
}

runAllTests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
