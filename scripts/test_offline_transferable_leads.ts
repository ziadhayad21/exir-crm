// scripts/test_offline_transferable_leads.ts
// Comprehensive Test Suite for Offline Lead Handling + Transferable Leads (Prompt 3)
// Covers all 14 mandatory tests from section 21.

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
    await admin.from('leads').delete().in('id', cleanupLeadIds);
    cleanupLeadIds.length = 0;
  }
  if (cleanupIdentityIds.length > 0) {
    await admin.from('channel_identities').delete().in('id', cleanupIdentityIds);
    cleanupIdentityIds.length = 0;
  }
  // Reset all employees to offline
  if (ctx) {
    await setEmployeeStatus(ctx.adminEmp.id, false);
    await setEmployeeStatus(ctx.sales1Emp.id, false);
    await setEmployeeStatus(ctx.sales2Emp.id, false);
    await setEmployeeStatus(ctx.sales3Emp.id, false);
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST 1 — OFFLINE OWNER, NO MESSAGE
// Ahmed owns 3 Leads. Ahmed goes Offline.
// Ahmed has never sent an outbound message for them.
// Mohamed (Online Sales) has 0 active Leads.
// Expected: Leads are transferable. Mohamed claims up to 2.
// ═══════════════════════════════════════════════════════════════
async function test1_OfflineOwnerNoMessage() {
  console.log('\n[Test 1] Offline Owner, No Message: Ahmed Offline with 3 unmessaged leads');
  await setEmployeeStatus(ctx.adminEmp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, false);
  await setEmployeeStatus(ctx.sales1Emp.id, true);

  const ahmedLeads: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const threadId = `test1_thread_${Date.now()}_${i}`;
    const { data: res, error } = await admin.rpc('ingest_inbound_message', {
      p_raw_event_id: null,
      p_channel: 'whatsapp',
      p_external_sender_id: `WA_T1_USER_${i}_${Date.now()}`,
      p_sender_display_name: `T1 Customer ${i}`,
      p_sender_phone: `2010111101${i}`,
      p_external_thread_id: threadId,
      p_external_message_id: `WA_MSG_T1_${i}_${Date.now()}`,
      p_message_type: 'text',
      p_content: `Inquiry ${i}`,
      p_media_url: null,
      p_business_tz: 'Africa/Cairo',
    });
    if (error || !res?.lead_id) throw new Error(`Setup failed: ${JSON.stringify(error)}`);
    cleanupLeadIds.push(res.lead_id);
    cleanupConvIds.push(res.conversation_id);
    ahmedLeads.push(res.lead_id);
  }

  // Ahmed goes Offline, Mohamed comes Online
  await setEmployeeStatus(ctx.sales1Emp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, true);

  // Mohamed claims batch of transferable leads
  const { data: claimedCount, error: claimErr } = await admin.rpc('claim_transferable_lead_batch', {
    p_employee_id: ctx.sales2Emp.id,
    p_batch_limit: 2,
    p_business_tz: 'Africa/Cairo',
  });

  if (claimErr) throw new Error(`Claim RPC failed: ${claimErr.message}`);

  console.log(`Mohamed claimed ${claimedCount} transferable leads out of 3`);
  if (claimedCount !== 2) {
    throw new Error(`FAILED: Expected Mohamed to claim exactly 2 leads, claimed ${claimedCount}!`);
  }

  console.log('✅ TEST 1 PASSED: Offline owner unmessaged leads are transferable; Mohamed claimed batch of 2.');
}

// ═══════════════════════════════════════════════════════════════
// TEST 2 — BATCH LIMIT
// Transferable backlog: 6 Leads. Ahmed is eligible (Online, 0 active leads).
// Expected: First batch = 2 (never 3, 4, 5, or 6 in one batch).
// ═══════════════════════════════════════════════════════════════
async function test2_BatchLimit() {
  console.log('\n[Test 2] Batch Limit: 6 transferable leads, Ahmed claims batch');
  await setEmployeeStatus(ctx.adminEmp.id, false);
  await setEmployeeStatus(ctx.sales1Emp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, true);

  for (let i = 1; i <= 6; i++) {
    const threadId = `test2_thread_${Date.now()}_${i}`;
    const { data: res, error } = await admin.rpc('ingest_inbound_message', {
      p_raw_event_id: null,
      p_channel: 'whatsapp',
      p_external_sender_id: `WA_T2_USER_${i}_${Date.now()}`,
      p_sender_display_name: `T2 Customer ${i}`,
      p_sender_phone: `2010222202${i}`,
      p_external_thread_id: threadId,
      p_external_message_id: `WA_MSG_T2_${i}_${Date.now()}`,
      p_message_type: 'text',
      p_content: `Inquiry ${i}`,
      p_media_url: null,
      p_business_tz: 'Africa/Cairo',
    });
    if (error || !res?.lead_id) throw new Error(`Setup failed: ${JSON.stringify(error)}`);
    cleanupLeadIds.push(res.lead_id);
    cleanupConvIds.push(res.conversation_id);
  }

  // Ziad goes offline, Ahmed comes Online with 0 active leads
  await setEmployeeStatus(ctx.sales3Emp.id, false);
  await setEmployeeStatus(ctx.sales1Emp.id, true);

  // Ahmed attempts to claim with p_batch_limit = 5 (parameter tampering test)
  const { data: claimedCount, error: claimErr } = await admin.rpc('claim_transferable_lead_batch', {
    p_employee_id: ctx.sales1Emp.id,
    p_batch_limit: 5, // Even if requested 5, system MUST enforce max 2!
    p_business_tz: 'Africa/Cairo',
  });

  if (claimErr) throw new Error(`Claim RPC error: ${claimErr.message}`);

  console.log(`Ahmed requested 5, received: ${claimedCount}`);
  if (claimedCount !== 2) {
    throw new Error(`FAILED: Batch ceiling failed! Ahmed received ${claimedCount}, expected max 2!`);
  }

  console.log('✅ TEST 2 PASSED: Batch limit of 2 strictly enforced (never 3, 4, 5, or 6).');
}

// ═══════════════════════════════════════════════════════════════
// TEST 3 — SECOND BATCH
// Ahmed takes 2. Ahmed finishes those 2 Leads. 4 transferable Leads remain.
// Expected: Ahmed can take another batch of up to 2.
// ═══════════════════════════════════════════════════════════════
async function test3_SecondBatch() {
  console.log('\n[Test 3] Second Batch: Ahmed claims 2, finishes them, then claims second batch of 2');
  await setEmployeeStatus(ctx.adminEmp.id, false);
  await setEmployeeStatus(ctx.sales1Emp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, true);

  for (let i = 1; i <= 4; i++) {
    const threadId = `test3_thread_${Date.now()}_${i}`;
    const { data: res, error } = await admin.rpc('ingest_inbound_message', {
      p_raw_event_id: null,
      p_channel: 'whatsapp',
      p_external_sender_id: `WA_T3_USER_${i}_${Date.now()}`,
      p_sender_display_name: `T3 Customer ${i}`,
      p_sender_phone: `2010333303${i}`,
      p_external_thread_id: threadId,
      p_external_message_id: `WA_MSG_T3_${i}_${Date.now()}`,
      p_message_type: 'text',
      p_content: `Inquiry ${i}`,
      p_media_url: null,
      p_business_tz: 'Africa/Cairo',
    });
    if (error || !res?.lead_id) throw new Error(`Setup failed: ${JSON.stringify(error)}`);
    cleanupLeadIds.push(res.lead_id);
    cleanupConvIds.push(res.conversation_id);
  }

  await setEmployeeStatus(ctx.sales3Emp.id, false);
  await setEmployeeStatus(ctx.sales1Emp.id, true);

  // Batch 1
  const { data: batch1Count } = await admin.rpc('claim_transferable_lead_batch', {
    p_employee_id: ctx.sales1Emp.id,
    p_batch_limit: 2,
  });
  if (batch1Count !== 2) throw new Error(`Batch 1 failed: claimed ${batch1Count}`);

  // Fetch Ahmed's 2 claimed leads and mark them completed ('converted')
  const { data: ahmedActiveLeads } = await admin
    .from('leads')
    .select('id')
    .eq('assigned_to', ctx.sales1Emp.id)
    .in('status', ['new', 'contacted']);

  for (const l of ahmedActiveLeads ?? []) {
    await admin.from('leads').update({ status: 'converted' }).eq('id', l.id);
  }

  // Now Ahmed has 0 active leads again. Claim Batch 2
  const { data: batch2Count } = await admin.rpc('claim_transferable_lead_batch', {
    p_employee_id: ctx.sales1Emp.id,
    p_batch_limit: 2,
  });

  console.log(`Batch 1: ${batch1Count}, Batch 2: ${batch2Count}`);
  if (batch2Count !== 2) {
    throw new Error(`FAILED: Batch 2 claim failed! Claimed ${batch2Count}, expected 2!`);
  }

  console.log('✅ TEST 3 PASSED: Ahmed finished first batch, then successfully claimed second batch of 2.');
}

// ═══════════════════════════════════════════════════════════════
// TEST 4 — NEW OWNER GOES OFFLINE BEFORE MESSAGING
// Ahmed takes 2 Leads (Lead A, Lead B). Ahmed sends no message.
// Ahmed goes Offline.
// Expected: Both Lead A and Lead B become transferable again.
// Mohamed (Online) can take them.
// ═══════════════════════════════════════════════════════════════
async function test4_NewOwnerOfflineBeforeMessaging() {
  console.log('\n[Test 4] New Owner Goes Offline Before Messaging');
  await setEmployeeStatus(ctx.adminEmp.id, false);
  await setEmployeeStatus(ctx.sales1Emp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, true);

  for (let i = 1; i <= 2; i++) {
    const threadId = `test4_thread_${Date.now()}_${i}`;
    const { data: res } = await admin.rpc('ingest_inbound_message', {
      p_raw_event_id: null,
      p_channel: 'whatsapp',
      p_external_sender_id: `WA_T4_USER_${i}_${Date.now()}`,
      p_sender_display_name: `T4 Customer ${i}`,
      p_sender_phone: `2010444404${i}`,
      p_external_thread_id: threadId,
      p_external_message_id: `WA_MSG_T4_${i}_${Date.now()}`,
      p_message_type: 'text',
      p_content: `Inquiry ${i}`,
      p_media_url: null,
      p_business_tz: 'Africa/Cairo',
    });
    cleanupLeadIds.push(res.lead_id);
    cleanupConvIds.push(res.conversation_id);
  }
  await setEmployeeStatus(ctx.sales3Emp.id, false);

  // Ahmed comes online and claims the 2 leads
  await setEmployeeStatus(ctx.sales1Emp.id, true);
  const { data: ahmedClaimed } = await admin.rpc('claim_transferable_lead_batch', {
    p_employee_id: ctx.sales1Emp.id,
    p_batch_limit: 2,
  });
  if (ahmedClaimed !== 2) throw new Error(`Ahmed setup claim failed: ${ahmedClaimed}`);

  // Ahmed sends NO message and goes Offline
  await setEmployeeStatus(ctx.sales1Emp.id, false);
  // Mohamed comes Online
  await setEmployeeStatus(ctx.sales2Emp.id, true);

  // Mohamed claims transferable leads
  const { data: mohamedClaimed } = await admin.rpc('claim_transferable_lead_batch', {
    p_employee_id: ctx.sales2Emp.id,
    p_batch_limit: 2,
  });

  console.log(`Mohamed claimed ${mohamedClaimed} leads after Ahmed went offline without messaging`);
  if (mohamedClaimed !== 2) {
    throw new Error(`FAILED: Expected Mohamed to claim 2 leads, claimed ${mohamedClaimed}!`);
  }

  console.log('✅ TEST 4 PASSED: New owner went offline before messaging; both leads became transferable again.');
}

// ═══════════════════════════════════════════════════════════════
// TEST 5 — NEW OWNER MESSAGES ONE LEAD
// Ahmed takes 2 Leads (Lead A, Lead B).
// Ahmed sends an outbound message on Lead A only. Ahmed goes Offline.
// Expected: Lead A → NOT transferable. Lead B → transferable.
// Mohamed can claim Lead B, but CANNOT claim Lead A.
// ═══════════════════════════════════════════════════════════════
async function test5_NewOwnerMessagesOneLead() {
  console.log('\n[Test 5] New Owner Messages One Lead: Lead A messaged, Lead B unmessaged');
  await setEmployeeStatus(ctx.adminEmp.id, false);
  await setEmployeeStatus(ctx.sales1Emp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, true);

  const convIds: string[] = [];

  for (let i = 1; i <= 2; i++) {
    const threadId = `test5_thread_${Date.now()}_${i}`;
    const { data: res } = await admin.rpc('ingest_inbound_message', {
      p_raw_event_id: null,
      p_channel: 'whatsapp',
      p_external_sender_id: `WA_T5_USER_${i}_${Date.now()}`,
      p_sender_display_name: `T5 Customer ${i}`,
      p_sender_phone: `2010555505${i}`,
      p_external_thread_id: threadId,
      p_external_message_id: `WA_MSG_T5_${i}_${Date.now()}`,
      p_message_type: 'text',
      p_content: `Inquiry ${i}`,
      p_media_url: null,
      p_business_tz: 'Africa/Cairo',
    });
    cleanupLeadIds.push(res.lead_id);
    cleanupConvIds.push(res.conversation_id);
    convIds.push(res.conversation_id);
  }
  await setEmployeeStatus(ctx.sales3Emp.id, false);

  // Ahmed claims the 2 leads
  await setEmployeeStatus(ctx.sales1Emp.id, true);
  await admin.rpc('claim_transferable_lead_batch', { p_employee_id: ctx.sales1Emp.id, p_batch_limit: 2 });

  // Ahmed sends outbound message on Lead A (convIds[0]) ONLY
  await admin.from('messages').insert({
    conversation_id: convIds[0],
    direction: 'outbound',
    sender_type: 'employee',
    sender_employee_id: ctx.sales1Emp.id,
    content: 'Hello, how can I help you?',
    status: 'sent',
  });

  // Ahmed goes Offline, Mohamed comes Online
  await setEmployeeStatus(ctx.sales1Emp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, true);

  // Mohamed claims transferable leads
  const { data: mohamedClaimed } = await admin.rpc('claim_transferable_lead_batch', {
    p_employee_id: ctx.sales2Emp.id,
    p_batch_limit: 2,
  });

  console.log(`Mohamed claimed ${mohamedClaimed} leads (Lead A messaged, Lead B unmessaged)`);

  if (mohamedClaimed !== 1) {
    throw new Error(`FAILED: Expected Mohamed to claim ONLY Lead B (1 lead), claimed ${mohamedClaimed}!`);
  }

  // Verify Lead A is STILL assigned to Ahmed
  const { data: convA } = await admin.from('conversations').select('lead_id').eq('id', convIds[0]).single();
  const { data: leadA } = await admin.from('leads').select('assigned_to').eq('id', convA?.lead_id).single();

  if (leadA?.assigned_to !== ctx.sales1Emp.id) {
    throw new Error(`FAILED: Messaged Lead A was incorrectly transferred to ${leadA?.assigned_to}!`);
  }

  console.log('✅ TEST 5 PASSED: Messaged Lead A was protected from transfer; unmessaged Lead B was transferred to Mohamed.');
}

// ═══════════════════════════════════════════════════════════════
// TEST 6 — ORIGINAL OWNER RETURNS
// Ahmed's unmessaged Lead was transferred to Mohamed. Ahmed returns Online.
// Expected: Lead remains with Mohamed. No automatic return to Ahmed.
// ═══════════════════════════════════════════════════════════════
async function test6_OriginalOwnerReturns() {
  console.log('\n[Test 6] Original Owner Returns Online: No automatic reclaim');
  await setEmployeeStatus(ctx.adminEmp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, false);
  await setEmployeeStatus(ctx.sales1Emp.id, true);

  const threadId = `test6_thread_${Date.now()}`;
  const { data: res } = await admin.rpc('ingest_inbound_message', {
    p_raw_event_id: null,
    p_channel: 'whatsapp',
    p_external_sender_id: `WA_T6_USER_${Date.now()}`,
    p_sender_display_name: 'T6 Customer',
    p_sender_phone: '20106666061',
    p_external_thread_id: threadId,
    p_external_message_id: `WA_MSG_T6_${Date.now()}`,
    p_message_type: 'text',
    p_content: 'Inquiry for Ahmed',
    p_media_url: null,
    p_business_tz: 'Africa/Cairo',
  });
  cleanupLeadIds.push(res.lead_id);
  cleanupConvIds.push(res.conversation_id);

  // Ahmed goes offline, Mohamed comes online and claims the lead
  await setEmployeeStatus(ctx.sales1Emp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, true);
  await admin.rpc('claim_transferable_lead_batch', { p_employee_id: ctx.sales2Emp.id, p_batch_limit: 2 });

  // Verify lead is assigned to Mohamed
  const { data: leadAfterTransfer } = await admin
    .from('leads')
    .select('assigned_to')
    .eq('id', res.lead_id)
    .single();

  if (leadAfterTransfer?.assigned_to !== ctx.sales2Emp.id) {
    throw new Error(`Failed setup: Lead was not transferred to Mohamed`);
  }

  // Ahmed returns Online
  await setEmployeeStatus(ctx.sales1Emp.id, true);

  // Verify lead remains assigned to Mohamed
  const { data: leadAfterAhmedReturns } = await admin
    .from('leads')
    .select('assigned_to')
    .eq('id', res.lead_id)
    .single();

  if (leadAfterAhmedReturns?.assigned_to !== ctx.sales2Emp.id) {
    throw new Error(`FAILED: Lead was automatically reclaimed by original owner Ahmed!`);
  }

  console.log('✅ TEST 6 PASSED: Original owner Ahmed returned Online; lead remained with Mohamed.');
}

// ═══════════════════════════════════════════════════════════════
// TEST 7 — EXISTING OWNER STILL ONLINE
// Ahmed is Online. Ahmed owns unmessaged Leads.
// Mohamed (Online, 0 active leads) attempts to claim transferable leads.
// Expected: Ahmed's leads are NOT transferable. Mohamed receives 0.
// ═══════════════════════════════════════════════════════════════
async function test7_ExistingOwnerStillOnline() {
  console.log('\n[Test 7] Existing Owner Still Online: Leads owned by Online Ahmed are NOT transferable');
  await setEmployeeStatus(ctx.adminEmp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, false);
  await setEmployeeStatus(ctx.sales1Emp.id, true);

  const threadId = `test7_thread_${Date.now()}`;
  const { data: res } = await admin.rpc('ingest_inbound_message', {
    p_raw_event_id: null,
    p_channel: 'whatsapp',
    p_external_sender_id: `WA_T7_USER_${Date.now()}`,
    p_sender_display_name: 'T7 Customer',
    p_sender_phone: '20107777071',
    p_external_thread_id: threadId,
    p_external_message_id: `WA_MSG_T7_${Date.now()}`,
    p_message_type: 'text',
    p_content: 'Inquiry owned by online Ahmed',
    p_media_url: null,
    p_business_tz: 'Africa/Cairo',
  });
  cleanupLeadIds.push(res.lead_id);
  cleanupConvIds.push(res.conversation_id);

  // Mohamed comes Online with 0 active leads and tries to claim
  await setEmployeeStatus(ctx.sales2Emp.id, true);
  const { data: mohamedClaimed } = await admin.rpc('claim_transferable_lead_batch', {
    p_employee_id: ctx.sales2Emp.id,
    p_batch_limit: 2,
  });

  console.log(`Mohamed claimed ${mohamedClaimed} leads while Ahmed was Online`);
  if (mohamedClaimed !== 0) {
    throw new Error(`FAILED: Mohamed claimed ${mohamedClaimed} leads owned by Online Ahmed! Expected 0.`);
  }

  console.log('✅ TEST 7 PASSED: Owner Ahmed is Online; unmessaged leads were NOT transferable.');
}

// ═══════════════════════════════════════════════════════════════
// TEST 8 — EMPLOYEE HAS OWN ACTIVE LEADS
// Ahmed is Online, has active Leads (new/in_progress).
// Transferable backlog exists.
// Expected: Ahmed CANNOT take transferable backlog while active workload > 0.
// ═══════════════════════════════════════════════════════════════
async function test8_EmployeeHasOwnActiveLeads() {
  console.log('\n[Test 8] Employee Has Own Active Leads: Cannot claim backlog while active_workload > 0');
  await setEmployeeStatus(ctx.adminEmp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, false);
  await setEmployeeStatus(ctx.sales1Emp.id, true);

  const threadId1 = `test8_thread1_${Date.now()}`;
  const { data: res1 } = await admin.rpc('ingest_inbound_message', {
    p_raw_event_id: null,
    p_channel: 'whatsapp',
    p_external_sender_id: `WA_T8_USER1_${Date.now()}`,
    p_sender_display_name: 'Ahmed Active Customer',
    p_sender_phone: '20108888081',
    p_external_thread_id: threadId1,
    p_external_message_id: `WA_MSG_T8_1_${Date.now()}`,
    p_message_type: 'text',
    p_content: 'Ahmed active lead',
    p_media_url: null,
    p_business_tz: 'Africa/Cairo',
  });
  cleanupLeadIds.push(res1.lead_id);
  cleanupConvIds.push(res1.conversation_id);

  // Setup transferable backlog owned by offline Ziad
  await setEmployeeStatus(ctx.sales1Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, true);

  const threadId2 = `test8_thread2_${Date.now()}`;
  const { data: res2 } = await admin.rpc('ingest_inbound_message', {
    p_raw_event_id: null,
    p_channel: 'whatsapp',
    p_external_sender_id: `WA_T8_USER2_${Date.now()}`,
    p_sender_display_name: 'Offline Ziad Customer',
    p_sender_phone: '20108888082',
    p_external_thread_id: threadId2,
    p_external_message_id: `WA_MSG_T8_2_${Date.now()}`,
    p_message_type: 'text',
    p_content: 'Ziad offline lead',
    p_media_url: null,
    p_business_tz: 'Africa/Cairo',
  });
  cleanupLeadIds.push(res2.lead_id);
  cleanupConvIds.push(res2.conversation_id);
  await setEmployeeStatus(ctx.sales3Emp.id, false);

  // Ahmed comes back online (now Ahmed has 1 active lead res1) and attempts to claim transferable backlog
  await setEmployeeStatus(ctx.sales1Emp.id, true);
  const { data: ahmedClaimed } = await admin.rpc('claim_transferable_lead_batch', {
    p_employee_id: ctx.sales1Emp.id,
    p_batch_limit: 2,
  });

  console.log(`Ahmed (active count > 0) claimed: ${ahmedClaimed}`);
  if (ahmedClaimed !== 0) {
    throw new Error(`FAILED: Ahmed claimed ${ahmedClaimed} transferable leads while he still had active workload!`);
  }

  console.log('✅ TEST 8 PASSED: Employee with active workload received 0 transferable leads.');
}

// ═══════════════════════════════════════════════════════════════
// TEST 9 — FAIR SHARING
// Ahmed and Mohamed are both Online with 0 active Leads.
// 6 transferable Leads exist.
// Expected: Backlog shared fairly (2 each). One employee does not monopolize all 6.
// ═══════════════════════════════════════════════════════════════
async function test9_FairSharing() {
  console.log('\n[Test 9] Fair Sharing: 6 transferable leads, Ahmed & Mohamed Online with 0 active leads');
  await setEmployeeStatus(ctx.adminEmp.id, false);
  await setEmployeeStatus(ctx.sales1Emp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, true);

  for (let i = 1; i <= 6; i++) {
    const threadId = `test9_thread_${Date.now()}_${i}`;
    const { data: res } = await admin.rpc('ingest_inbound_message', {
      p_raw_event_id: null,
      p_channel: 'whatsapp',
      p_external_sender_id: `WA_T9_USER_${i}_${Date.now()}`,
      p_sender_display_name: `T9 Customer ${i}`,
      p_sender_phone: `2010999909${i}`,
      p_external_thread_id: threadId,
      p_external_message_id: `WA_MSG_T9_${i}_${Date.now()}`,
      p_message_type: 'text',
      p_content: `Inquiry ${i}`,
      p_media_url: null,
      p_business_tz: 'Africa/Cairo',
    });
    cleanupLeadIds.push(res.lead_id);
    cleanupConvIds.push(res.conversation_id);
  }
  await setEmployeeStatus(ctx.sales3Emp.id, false);

  // Both Ahmed and Mohamed are Online with 0 active leads
  await setEmployeeStatus(ctx.sales1Emp.id, true);
  await setEmployeeStatus(ctx.sales2Emp.id, true);

  // Run backlog processing
  const { data: totalClaimed } = await admin.rpc('process_transferable_lead_backlog', {
    p_business_tz: 'Africa/Cairo',
  });

  // Count leads assigned to Ahmed vs Mohamed
  const { count: ahmedCount } = await admin.from('leads').select('id', { count: 'exact', head: true }).eq('assigned_to', ctx.sales1Emp.id).eq('assignment_source', 'transfer');
  const { count: mohamedCount } = await admin.from('leads').select('id', { count: 'exact', head: true }).eq('assigned_to', ctx.sales2Emp.id).eq('assignment_source', 'transfer');

  console.log(`Total claimed: ${totalClaimed}, Ahmed=${ahmedCount}, Mohamed=${mohamedCount}`);

  if (ahmedCount !== 2 || mohamedCount !== 2) {
    throw new Error(`FAILED: Unfair backlog distribution! Expected (2, 2), got (${ahmedCount}, ${mohamedCount})!`);
  }

  console.log('✅ TEST 9 PASSED: Backlog shared fairly in batches of 2 (Ahmed=2, Mohamed=2). Neither monopolized backlog.');
}

// ═══════════════════════════════════════════════════════════════
// TEST 10 — FIFO
// Transferable Leads have different creation timestamps.
// Expected: Older transferable Leads selected first.
// ═══════════════════════════════════════════════════════════════
async function test10_FifoOrder() {
  console.log('\n[Test 10] FIFO Order: Older transferable leads selected first');
  await setEmployeeStatus(ctx.adminEmp.id, false);
  await setEmployeeStatus(ctx.sales1Emp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, true);

  const createdLeadIds: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const threadId = `test10_thread_${Date.now()}_${i}`;
    const { data: res } = await admin.rpc('ingest_inbound_message', {
      p_raw_event_id: null,
      p_channel: 'whatsapp',
      p_external_sender_id: `WA_T10_USER_${i}_${Date.now()}`,
      p_sender_display_name: `T10 Customer ${i}`,
      p_sender_phone: `2010101010${i}`,
      p_external_thread_id: threadId,
      p_external_message_id: `WA_MSG_T10_${i}_${Date.now()}`,
      p_message_type: 'text',
      p_content: `FIFO lead ${i}`,
      p_media_url: null,
      p_business_tz: 'Africa/Cairo',
    });
    cleanupLeadIds.push(res.lead_id);
    cleanupConvIds.push(res.conversation_id);
    createdLeadIds.push(res.lead_id);
    // Brief sleep to guarantee timestamp ordering
    await new Promise((r) => setTimeout(r, 50));
  }

  await setEmployeeStatus(ctx.sales3Emp.id, false);
  await setEmployeeStatus(ctx.sales1Emp.id, true);

  // Ahmed claims batch of 2
  await admin.rpc('claim_transferable_lead_batch', { p_employee_id: ctx.sales1Emp.id, p_batch_limit: 2 });

  // Fetch Ahmed's claimed leads sorted by assignment time
  const { data: ahmedLeads } = await admin
    .from('leads')
    .select('id')
    .eq('assigned_to', ctx.sales1Emp.id)
    .order('assigned_at', { ascending: true });

  const claimedIds = ahmedLeads?.map((l) => l.id) ?? [];
  console.log('Expected oldest 2:', createdLeadIds.slice(0, 2));
  console.log('Claimed 2:', claimedIds);

  if (claimedIds[0] !== createdLeadIds[0] || claimedIds[1] !== createdLeadIds[1]) {
    throw new Error(`FAILED: FIFO order violated! Expected oldest 2 (${createdLeadIds[0]}, ${createdLeadIds[1]}), got (${claimedIds[0]}, ${claimedIds[1]})`);
  }

  console.log('✅ TEST 10 PASSED: FIFO order strictly maintained (oldest transferable leads claimed first).');
}

// ═══════════════════════════════════════════════════════════════
// TEST 11 — CONCURRENCY
// Two Online Sales employees claim transferable leads simultaneously.
// Expected: no duplicate transfer, no double assignment, batch <= 2.
// ═══════════════════════════════════════════════════════════════
async function test11_Concurrency() {
  console.log('\n[Test 11] Concurrency Safety: Parallel claims from 2 Online sales reps');
  await setEmployeeStatus(ctx.adminEmp.id, false);
  await setEmployeeStatus(ctx.sales1Emp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, true);

  for (let i = 1; i <= 4; i++) {
    const threadId = `test11_thread_${Date.now()}_${i}`;
    const { data: res } = await admin.rpc('ingest_inbound_message', {
      p_raw_event_id: null,
      p_channel: 'whatsapp',
      p_external_sender_id: `WA_T11_USER_${i}_${Date.now()}`,
      p_sender_display_name: `T11 Customer ${i}`,
      p_sender_phone: `2010111111${i}`,
      p_external_thread_id: threadId,
      p_external_message_id: `WA_MSG_T11_${i}_${Date.now()}`,
      p_message_type: 'text',
      p_content: `Concurrent lead ${i}`,
      p_media_url: null,
      p_business_tz: 'Africa/Cairo',
    });
    cleanupLeadIds.push(res.lead_id);
    cleanupConvIds.push(res.conversation_id);
  }
  await setEmployeeStatus(ctx.sales3Emp.id, false);

  await setEmployeeStatus(ctx.sales1Emp.id, true);
  await setEmployeeStatus(ctx.sales2Emp.id, true);

  // Parallel claim requests
  const [res1, res2] = await Promise.all([
    admin.rpc('claim_transferable_lead_batch', { p_employee_id: ctx.sales1Emp.id, p_batch_limit: 2 }),
    admin.rpc('claim_transferable_lead_batch', { p_employee_id: ctx.sales2Emp.id, p_batch_limit: 2 }),
  ]);

  console.log(`Ahmed claimed: ${res1.data}, Mohamed claimed: ${res2.data}`);

  if (res1.error || res2.error) {
    throw new Error(`Concurrency RPC error: ${JSON.stringify(res1.error || res2.error)}`);
  }

  if (res1.data! + res2.data! !== 4) {
    throw new Error(`FAILED: Total claimed ${res1.data! + res2.data!} !== 4!`);
  }

  // Check no lead is assigned to both
  const { data: ahmedLeads } = await admin.from('leads').select('id').eq('assigned_to', ctx.sales1Emp.id);
  const { data: mohamedLeads } = await admin.from('leads').select('id').eq('assigned_to', ctx.sales2Emp.id);

  const ahmedIds = new Set(ahmedLeads?.map((l) => l.id));
  const overlap = mohamedLeads?.filter((l) => ahmedIds.has(l.id));

  if (overlap && overlap.length > 0) {
    throw new Error(`FAILED: Double assignment detected! Lead ${overlap[0].id} assigned to both reps!`);
  }

  console.log('✅ TEST 11 PASSED: Concurrent transfers safe; 0 double assignments, 0 deadlocks.');
}

// ═══════════════════════════════════════════════════════════════
// TEST 12 — ADMIN EXCLUSION
// Admin is Online and has no active Leads. Transferable backlog exists.
// Expected: Admin receives 0.
// ═══════════════════════════════════════════════════════════════
async function test12_AdminExclusion() {
  console.log('\n[Test 12] Admin Exclusion: Admin claims transferable backlog');
  await setEmployeeStatus(ctx.adminEmp.id, false);
  await setEmployeeStatus(ctx.sales1Emp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, true);

  const threadId = `test12_thread_${Date.now()}`;
  const { data: res } = await admin.rpc('ingest_inbound_message', {
    p_raw_event_id: null,
    p_channel: 'whatsapp',
    p_external_sender_id: `WA_T12_USER_${Date.now()}`,
    p_sender_display_name: 'T12 Customer',
    p_sender_phone: '20101212121',
    p_external_thread_id: threadId,
    p_external_message_id: `WA_MSG_T12_${Date.now()}`,
    p_message_type: 'text',
    p_content: `Backlog lead`,
    p_media_url: null,
    p_business_tz: 'Africa/Cairo',
  });
  cleanupLeadIds.push(res.lead_id);
  cleanupConvIds.push(res.conversation_id);
  await setEmployeeStatus(ctx.sales3Emp.id, false);

  // Admin comes online with 0 active leads and tries to claim
  await setEmployeeStatus(ctx.adminEmp.id, true);
  const { data: adminClaimed } = await admin.rpc('claim_transferable_lead_batch', {
    p_employee_id: ctx.adminEmp.id,
    p_batch_limit: 2,
  });

  console.log(`Admin claim result: ${adminClaimed}`);
  if (adminClaimed !== 0) {
    throw new Error(`FAILED: Admin received ${adminClaimed} transferable leads! Expected 0.`);
  }

  console.log('✅ TEST 12 PASSED: Admin received 0 transferable leads.');
}

// ═══════════════════════════════════════════════════════════════
// TEST 13 — PROTECTED LEAD
// Owner is Offline BUT has already sent an outbound employee message.
// Expected: Lead is NOT transferable.
// ═══════════════════════════════════════════════════════════════
async function test13_ProtectedLead() {
  console.log('\n[Test 13] Protected Lead: Owner Offline BUT sent outbound employee message');
  await setEmployeeStatus(ctx.adminEmp.id, false);
  await setEmployeeStatus(ctx.sales1Emp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, true);

  const threadId = `test13_thread_${Date.now()}`;
  const { data: res } = await admin.rpc('ingest_inbound_message', {
    p_raw_event_id: null,
    p_channel: 'whatsapp',
    p_external_sender_id: `WA_T13_USER_${Date.now()}`,
    p_sender_display_name: 'T13 Customer',
    p_sender_phone: '20101313131',
    p_external_thread_id: threadId,
    p_external_message_id: `WA_MSG_T13_${Date.now()}`,
    p_message_type: 'text',
    p_content: `Inquiry`,
    p_media_url: null,
    p_business_tz: 'Africa/Cairo',
  });
  cleanupLeadIds.push(res.lead_id);
  cleanupConvIds.push(res.conversation_id);

  // Ziad (owner) sends outbound employee message
  await admin.from('messages').insert({
    conversation_id: res.conversation_id,
    direction: 'outbound',
    sender_type: 'employee',
    sender_employee_id: ctx.sales3Emp.id,
    content: 'Welcome to El-Exir Tourism!',
    status: 'sent',
  });

  // Ziad goes offline, Mohamed comes online
  await setEmployeeStatus(ctx.sales3Emp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, true);

  const { data: mohamedClaimed } = await admin.rpc('claim_transferable_lead_batch', {
    p_employee_id: ctx.sales2Emp.id,
    p_batch_limit: 2,
  });

  console.log(`Mohamed claimed ${mohamedClaimed} leads (protected lead existed)`);
  if (mohamedClaimed !== 0) {
    throw new Error(`FAILED: Mohamed claimed protected lead! Expected 0.`);
  }

  // Verify lead is STILL assigned to Ziad
  const { data: leadState } = await admin.from('leads').select('assigned_to').eq('id', res.lead_id).single();
  if (leadState?.assigned_to !== ctx.sales3Emp.id) {
    throw new Error(`FAILED: Protected lead was transferred away from Ziad!`);
  }

  console.log('✅ TEST 13 PASSED: Outbound employee message protected lead from transfer even though owner is offline.');
}

// ═══════════════════════════════════════════════════════════════
// TEST 14 — PROMPT 2 REGRESSION
// Verify newly arriving leads still follow Basic Distribution rules (Prompt 2):
// - Mode A (Online sales exist) -> Online Sales only.
// - Mode B (All sales offline) -> All eligible Sales fairly.
// ═══════════════════════════════════════════════════════════════
async function test14_Prompt2Regression() {
  console.log('\n[Test 14] Prompt 2 Regression: Mode A and Mode B Basic Distribution');

  // Mode A: Ahmed Online, Mohamed Offline, Ziad Offline
  await setEmployeeStatus(ctx.adminEmp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, false);
  await setEmployeeStatus(ctx.sales1Emp.id, true);

  const threadIdA = `test14_modea_${Date.now()}`;
  const { data: resA } = await admin.rpc('ingest_inbound_message', {
    p_raw_event_id: null,
    p_channel: 'whatsapp',
    p_external_sender_id: `WA_T14_USERA_${Date.now()}`,
    p_sender_display_name: 'T14 Customer A',
    p_sender_phone: '20101414141',
    p_external_thread_id: threadIdA,
    p_external_message_id: `WA_MSG_T14A_${Date.now()}`,
    p_message_type: 'text',
    p_content: `Mode A lead`,
    p_media_url: null,
    p_business_tz: 'Africa/Cairo',
  });
  cleanupLeadIds.push(resA.lead_id);
  cleanupConvIds.push(resA.conversation_id);

  if (resA.assigned_to !== ctx.sales1Emp.id) {
    throw new Error(`FAILED Mode A: Expected Ahmed (${ctx.sales1Emp.id}), got ${resA.assigned_to}`);
  }

  // Mode B: All sales offline
  await setEmployeeStatus(ctx.sales1Emp.id, false);

  const threadIdB = `test14_modeb_${Date.now()}`;
  const { data: resB } = await admin.rpc('ingest_inbound_message', {
    p_raw_event_id: null,
    p_channel: 'whatsapp',
    p_external_sender_id: `WA_T14_USERB_${Date.now()}`,
    p_sender_display_name: 'T14 Customer B',
    p_sender_phone: '20101414142',
    p_external_thread_id: threadIdB,
    p_external_message_id: `WA_MSG_T14B_${Date.now()}`,
    p_message_type: 'text',
    p_content: `Mode B lead`,
    p_media_url: null,
    p_business_tz: 'Africa/Cairo',
  });
  cleanupLeadIds.push(resB.lead_id);
  cleanupConvIds.push(resB.conversation_id);

  if (!resB.assigned_to || resB.assigned_to === ctx.adminEmp.id) {
    throw new Error(`FAILED Mode B: Lead unassigned or assigned to Admin! Got ${resB.assigned_to}`);
  }

  console.log('✅ TEST 14 PASSED: Prompt 2 Basic Lead Distribution intact (Mode A & Mode B).');
}

// ═══════════════════════════════════════════════════════════════
// MAIN TEST RUNNER
// ═══════════════════════════════════════════════════════════════
async function runAllTests() {
  console.log('================================================================');
  console.log('   OFFLINE TRANSFERABLE LEADS — COMPLETE VERIFICATION SUITE    ');
  console.log('================================================================');

  try {
    await setupContext();
    await cleanupTestData();

    await test1_OfflineOwnerNoMessage();
    await cleanupTestData();

    await test2_BatchLimit();
    await cleanupTestData();

    await test3_SecondBatch();
    await cleanupTestData();

    await test4_NewOwnerOfflineBeforeMessaging();
    await cleanupTestData();

    await test5_NewOwnerMessagesOneLead();
    await cleanupTestData();

    await test6_OriginalOwnerReturns();
    await cleanupTestData();

    await test7_ExistingOwnerStillOnline();
    await cleanupTestData();

    await test8_EmployeeHasOwnActiveLeads();
    await cleanupTestData();

    await test9_FairSharing();
    await cleanupTestData();

    await test10_FifoOrder();
    await cleanupTestData();

    await test11_Concurrency();
    await cleanupTestData();

    await test12_AdminExclusion();
    await cleanupTestData();

    await test13_ProtectedLead();
    await cleanupTestData();

    await test14_Prompt2Regression();
    await cleanupTestData();

    console.log('\n================================================================');
    console.log('   🎉 ALL 14 MANDATORY TESTS PASSED WITH 100% SUCCESS!        ');
    console.log('================================================================\n');
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err);
    process.exitCode = 1;
  } finally {
    await cleanupTestData();
  }
}

void runAllTests();
