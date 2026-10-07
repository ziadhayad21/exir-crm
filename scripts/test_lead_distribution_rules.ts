// scripts/test_lead_distribution_rules.ts
// Comprehensive Test Suite for Basic Lead Distribution System (Prompt 2)
// Covers all 10 mandatory tests from section 14.

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createAdminClient } from '../src/lib/supabase/admin';
import { createClient } from '@supabase/supabase-js';

const admin = createAdminClient();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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
}

// ═══════════════════════════════════════════════════════════════
// TEST 1 — ONE ONLINE SALES
// Ahmed Online. Mohamed Offline. Ziad Offline.
// Create 10 new Leads.
// Expected: Ahmed = 10, Mohamed = 0, Ziad = 0, Admin = 0.
// ═══════════════════════════════════════════════════════════════
async function test1_OneOnlineSales() {
  console.log('\n[Test 1] One Online Sales: Ahmed Online, Mohamed Offline, Ziad Offline (10 Leads)');
  await setEmployeeStatus(ctx.adminEmp.id, false);
  await setEmployeeStatus(ctx.sales1Emp.id, true);
  await setEmployeeStatus(ctx.sales2Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, false);

  const assignedEmployees: string[] = [];

  for (let i = 1; i <= 10; i++) {
    const threadId = `test1_thread_${Date.now()}_${i}`;
    const { data: res, error } = await admin.rpc('ingest_inbound_message', {
      p_raw_event_id: null,
      p_channel: 'whatsapp',
      p_external_sender_id: `WA_USER_T1_${i}_${Date.now()}`,
      p_sender_display_name: `Test1 Customer ${i}`,
      p_sender_phone: `2010999901${i.toString().padStart(2, '0')}`,
      p_external_thread_id: threadId,
      p_external_message_id: `WA_MSG_T1_${i}_${Date.now()}`,
      p_message_type: 'text',
      p_content: `Inquiry message ${i}`,
      p_media_url: null,
      p_business_tz: 'Africa/Cairo',
    });

    if (error || !res?.lead_id) {
      throw new Error(`Test 1 lead creation failed: ${JSON.stringify(error)}`);
    }

    cleanupLeadIds.push(res.lead_id);
    cleanupConvIds.push(res.conversation_id);
    assignedEmployees.push(res.assigned_to);
  }

  const ahmedCount = assignedEmployees.filter((id) => id === ctx.sales1Emp.id).length;
  const mohamedCount = assignedEmployees.filter((id) => id === ctx.sales2Emp.id).length;
  const ziadCount = assignedEmployees.filter((id) => id === ctx.sales3Emp.id).length;
  const adminCount = assignedEmployees.filter((id) => id === ctx.adminEmp.id).length;

  console.log(`Results: Ahmed=${ahmedCount}, Mohamed=${mohamedCount}, Ziad=${ziadCount}, Admin=${adminCount}`);

  if (ahmedCount !== 10) {
    throw new Error(`FAILED: Expected Ahmed to receive 10 leads, got ${ahmedCount}!`);
  }
  if (mohamedCount !== 0) {
    throw new Error(`FAILED: Offline Mohamed received ${mohamedCount} leads, expected 0!`);
  }
  if (ziadCount !== 0) {
    throw new Error(`FAILED: Offline Ziad received ${ziadCount} leads, expected 0!`);
  }
  if (adminCount !== 0) {
    throw new Error(`FAILED: Admin received ${adminCount} leads, expected 0!`);
  }

  console.log('✅ TEST 1 PASSED: Ahmed = 10, Mohamed = 0, Ziad = 0, Admin = 0.');
}

// ═══════════════════════════════════════════════════════════════
// TEST 2 — MULTIPLE ONLINE SALES
// Ahmed Online. Mohamed Online. Ziad Offline.
// Create 6 new Leads.
// Expected: Ahmed + Mohamed receive Leads fairly (3 + 3), Ziad = 0, Admin = 0.
// ═══════════════════════════════════════════════════════════════
async function test2_MultipleOnlineSales() {
  console.log('\n[Test 2] Multiple Online Sales: Ahmed Online, Mohamed Online, Ziad Offline (6 Leads)');
  await setEmployeeStatus(ctx.adminEmp.id, false);
  await setEmployeeStatus(ctx.sales1Emp.id, true);
  await setEmployeeStatus(ctx.sales2Emp.id, true);
  await setEmployeeStatus(ctx.sales3Emp.id, false);

  const assignedEmployees: string[] = [];

  for (let i = 1; i <= 6; i++) {
    const threadId = `test2_thread_${Date.now()}_${i}`;
    const { data: res, error } = await admin.rpc('ingest_inbound_message', {
      p_raw_event_id: null,
      p_channel: 'messenger',
      p_external_sender_id: `FB_USER_T2_${i}_${Date.now()}`,
      p_sender_display_name: `Test2 Customer ${i}`,
      p_sender_phone: null,
      p_external_thread_id: threadId,
      p_external_message_id: `FB_MSG_T2_${i}_${Date.now()}`,
      p_message_type: 'text',
      p_content: `Inquiry message ${i}`,
      p_media_url: null,
      p_business_tz: 'Africa/Cairo',
    });

    if (error || !res?.lead_id) {
      throw new Error(`Test 2 lead creation failed: ${JSON.stringify(error)}`);
    }

    cleanupLeadIds.push(res.lead_id);
    cleanupConvIds.push(res.conversation_id);
    assignedEmployees.push(res.assigned_to);
  }

  const ahmedCount = assignedEmployees.filter((id) => id === ctx.sales1Emp.id).length;
  const mohamedCount = assignedEmployees.filter((id) => id === ctx.sales2Emp.id).length;
  const ziadCount = assignedEmployees.filter((id) => id === ctx.sales3Emp.id).length;
  const adminCount = assignedEmployees.filter((id) => id === ctx.adminEmp.id).length;

  console.log(`Results: Ahmed=${ahmedCount}, Mohamed=${mohamedCount}, Ziad=${ziadCount}, Admin=${adminCount}`);

  if (ziadCount !== 0) {
    throw new Error(`FAILED: Offline Ziad received ${ziadCount} leads, expected 0!`);
  }
  if (adminCount !== 0) {
    throw new Error(`FAILED: Admin received ${adminCount} leads, expected 0!`);
  }
  if (ahmedCount !== 3 || mohamedCount !== 3) {
    throw new Error(`FAILED: Distribution unfair between Ahmed (${ahmedCount}) and Mohamed (${mohamedCount})!`);
  }

  console.log('✅ TEST 2 PASSED: Ahmed = 3, Mohamed = 3, Ziad = 0, Admin = 0.');
}

// ═══════════════════════════════════════════════════════════════
// TEST 3 — ALL SALES OFFLINE
// Ahmed Offline. Mohamed Offline. Ziad Offline.
// Create 6 new Leads.
// Expected: Leads distributed among Ahmed/Mohamed/Ziad (2 each), unassigned = 0, Admin = 0.
// ═══════════════════════════════════════════════════════════════
async function test3_AllSalesOffline() {
  console.log('\n[Test 3] All Sales Offline: Ahmed, Mohamed, Ziad all Offline (6 Leads)');
  await setEmployeeStatus(ctx.adminEmp.id, false);
  await setEmployeeStatus(ctx.sales1Emp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, false);

  const assignedEmployees: string[] = [];

  for (let i = 1; i <= 6; i++) {
    const threadId = `test3_thread_${Date.now()}_${i}`;
    const { data: res, error } = await admin.rpc('ingest_inbound_message', {
      p_raw_event_id: null,
      p_channel: 'instagram',
      p_external_sender_id: `IG_USER_T3_${i}_${Date.now()}`,
      p_sender_display_name: `Test3 Customer ${i}`,
      p_sender_phone: null,
      p_external_thread_id: threadId,
      p_external_message_id: `IG_MSG_T3_${i}_${Date.now()}`,
      p_message_type: 'text',
      p_content: `Inquiry message ${i} when all offline`,
      p_media_url: null,
      p_business_tz: 'Africa/Cairo',
    });

    if (error || !res?.lead_id) {
      throw new Error(`Test 3 lead creation failed: ${JSON.stringify(error)}`);
    }

    cleanupLeadIds.push(res.lead_id);
    cleanupConvIds.push(res.conversation_id);
    assignedEmployees.push(res.assigned_to);
  }

  const ahmedCount = assignedEmployees.filter((id) => id === ctx.sales1Emp.id).length;
  const mohamedCount = assignedEmployees.filter((id) => id === ctx.sales2Emp.id).length;
  const ziadCount = assignedEmployees.filter((id) => id === ctx.sales3Emp.id).length;
  const adminCount = assignedEmployees.filter((id) => id === ctx.adminEmp.id).length;
  const unassignedCount = assignedEmployees.filter((id) => !id).length;

  console.log(`Results: Ahmed=${ahmedCount}, Mohamed=${mohamedCount}, Ziad=${ziadCount}, Admin=${adminCount}, Unassigned=${unassignedCount}`);

  if (unassignedCount > 0) {
    throw new Error(`FAILED: ${unassignedCount} leads remained unassigned when all sales offline!`);
  }
  if (adminCount !== 0) {
    throw new Error(`FAILED: Admin received ${adminCount} leads, expected 0!`);
  }
  if (ahmedCount !== 2 || mohamedCount !== 2 || ziadCount !== 2) {
    throw new Error(`FAILED: Expected perfectly fair distribution (2, 2, 2), got (${ahmedCount}, ${mohamedCount}, ${ziadCount})!`);
  }

  console.log('✅ TEST 3 PASSED: Ahmed = 2, Mohamed = 2, Ziad = 2, Unassigned = 0, Admin = 0.');
}

// ═══════════════════════════════════════════════════════════════
// TEST 4 — ADMIN ONLINE
// Admin Online. Ahmed Online. Mohamed Offline. (Ziad Offline).
// Create 4 new Leads.
// Expected: Admin = 0, Ahmed receives all 4, Mohamed = 0, Ziad = 0.
// ═══════════════════════════════════════════════════════════════
async function test4_AdminOnline() {
  console.log('\n[Test 4] Admin Online: Admin Online, Ahmed Online, Mohamed & Ziad Offline (4 Leads)');
  await setEmployeeStatus(ctx.adminEmp.id, true);
  await setEmployeeStatus(ctx.sales1Emp.id, true);
  await setEmployeeStatus(ctx.sales2Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, false);

  const assignedEmployees: string[] = [];

  for (let i = 1; i <= 4; i++) {
    const threadId = `test4_thread_${Date.now()}_${i}`;
    const { data: res, error } = await admin.rpc('ingest_inbound_message', {
      p_raw_event_id: null,
      p_channel: 'whatsapp',
      p_external_sender_id: `WA_USER_T4_${i}_${Date.now()}`,
      p_sender_display_name: `Test4 Customer ${i}`,
      p_sender_phone: `2010888804${i}`,
      p_external_thread_id: threadId,
      p_external_message_id: `WA_MSG_T4_${i}_${Date.now()}`,
      p_message_type: 'text',
      p_content: `Inquiry with admin online ${i}`,
      p_media_url: null,
      p_business_tz: 'Africa/Cairo',
    });

    if (error || !res?.lead_id) {
      throw new Error(`Test 4 lead creation failed: ${JSON.stringify(error)}`);
    }

    cleanupLeadIds.push(res.lead_id);
    cleanupConvIds.push(res.conversation_id);
    assignedEmployees.push(res.assigned_to);
  }

  const adminCount = assignedEmployees.filter((id) => id === ctx.adminEmp.id).length;
  const ahmedCount = assignedEmployees.filter((id) => id === ctx.sales1Emp.id).length;
  const mohamedCount = assignedEmployees.filter((id) => id === ctx.sales2Emp.id).length;
  const ziadCount = assignedEmployees.filter((id) => id === ctx.sales3Emp.id).length;

  console.log(`Results: Admin=${adminCount}, Ahmed=${ahmedCount}, Mohamed=${mohamedCount}, Ziad=${ziadCount}`);

  if (adminCount !== 0) {
    throw new Error(`FAILED: Online Admin received ${adminCount} leads, expected 0!`);
  }
  if (ahmedCount !== 4) {
    throw new Error(`FAILED: Expected Ahmed to receive all 4 leads, got ${ahmedCount}!`);
  }
  if (mohamedCount !== 0 || ziadCount !== 0) {
    throw new Error(`FAILED: Offline sales reps received leads!`);
  }

  console.log('✅ TEST 4 PASSED: Admin = 0, Ahmed = 4, Mohamed = 0, Ziad = 0.');
}

// ═══════════════════════════════════════════════════════════════
// TEST 5 — ADMIN ONLY ONLINE
// Admin Online. All Sales Offline.
// Create 6 new Leads.
// Expected: Admin = 0, Leads assigned to Sales employees, Unassigned = 0.
// ═══════════════════════════════════════════════════════════════
async function test5_AdminOnlyOnline() {
  console.log('\n[Test 5] Admin Only Online: Admin Online, All Sales Offline (6 Leads)');
  await setEmployeeStatus(ctx.adminEmp.id, true);
  await setEmployeeStatus(ctx.sales1Emp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, false);

  const assignedEmployees: string[] = [];

  for (let i = 1; i <= 6; i++) {
    const threadId = `test5_thread_${Date.now()}_${i}`;
    const { data: res, error } = await admin.rpc('ingest_inbound_message', {
      p_raw_event_id: null,
      p_channel: 'whatsapp',
      p_external_sender_id: `WA_USER_T5_${i}_${Date.now()}`,
      p_sender_display_name: `Test5 Customer ${i}`,
      p_sender_phone: `2010777705${i}`,
      p_external_thread_id: threadId,
      p_external_message_id: `WA_MSG_T5_${i}_${Date.now()}`,
      p_message_type: 'text',
      p_content: `Inquiry when admin only online ${i}`,
      p_media_url: null,
      p_business_tz: 'Africa/Cairo',
    });

    if (error || !res?.lead_id) {
      throw new Error(`Test 5 lead creation failed: ${JSON.stringify(error)}`);
    }

    cleanupLeadIds.push(res.lead_id);
    cleanupConvIds.push(res.conversation_id);
    assignedEmployees.push(res.assigned_to);
  }

  const adminCount = assignedEmployees.filter((id) => id === ctx.adminEmp.id).length;
  const unassignedCount = assignedEmployees.filter((id) => !id).length;
  const salesCount = assignedEmployees.filter((id) => id !== ctx.adminEmp.id && id).length;

  console.log(`Results: Admin=${adminCount}, Unassigned=${unassignedCount}, Assigned to Sales=${salesCount}`);

  if (adminCount !== 0) {
    throw new Error(`FAILED: Admin received ${adminCount} leads when Admin was only user online!`);
  }
  if (unassignedCount > 0) {
    throw new Error(`FAILED: ${unassignedCount} leads remained unassigned!`);
  }
  if (salesCount !== 6) {
    throw new Error(`FAILED: Expected all 6 leads assigned to Sales reps, got ${salesCount}`);
  }

  console.log('✅ TEST 5 PASSED: Admin = 0, Unassigned = 0, All leads assigned to Sales reps.');
}

// ═══════════════════════════════════════════════════════════════
// TEST 6 — EXISTING OWNERSHIP
// Ahmed owns existing Leads.
// Ahmed goes Offline. Mohamed Online.
// Create new Leads.
// Expected:
// - Existing Leads remain owned by Ahmed (not transferred).
// - New Leads follow availability rules (assigned to Mohamed).
// ═══════════════════════════════════════════════════════════════
async function test6_ExistingOwnership() {
  console.log('\n[Test 6] Existing Ownership: Ahmed owns existing Leads, goes Offline, Mohamed Online');
  // Ahmed is online initially
  await setEmployeeStatus(ctx.sales1Emp.id, true);
  await setEmployeeStatus(ctx.sales2Emp.id, false);
  await setEmployeeStatus(ctx.sales3Emp.id, false);

  const threadId = `test6_thread_${Date.now()}`;
  const { data: lead1, error: err1 } = await admin.rpc('ingest_inbound_message', {
    p_raw_event_id: null,
    p_channel: 'whatsapp',
    p_external_sender_id: `WA_USER_T6_ORIG_${Date.now()}`,
    p_sender_display_name: 'Existing Customer Ahmed',
    p_sender_phone: '20106666061',
    p_external_thread_id: threadId,
    p_external_message_id: `WA_MSG_T6_ORIG_${Date.now()}`,
    p_message_type: 'text',
    p_content: 'Ahmed initial inquiry',
    p_media_url: null,
    p_business_tz: 'Africa/Cairo',
  });

  if (err1 || !lead1?.lead_id) {
    throw new Error(`Failed to create initial lead in Test 6: ${JSON.stringify(err1)}`);
  }

  cleanupLeadIds.push(lead1.lead_id);
  cleanupConvIds.push(lead1.conversation_id);

  if (lead1.assigned_to !== ctx.sales1Emp.id) {
    throw new Error(`Lead should be assigned to Ahmed, got ${lead1.assigned_to}`);
  }

  console.log(`Initial lead assigned to Ahmed: ${lead1.lead_id}`);

  // Now Ahmed goes Offline, Mohamed comes Online
  await setEmployeeStatus(ctx.sales1Emp.id, false);
  await setEmployeeStatus(ctx.sales2Emp.id, true);

  // 1. Verify Ahmed's existing lead is STILL assigned to Ahmed
  const { data: verifiedLead } = await admin
    .from('leads')
    .select('assigned_to')
    .eq('id', lead1.lead_id)
    .single();

  if (verifiedLead?.assigned_to !== ctx.sales1Emp.id) {
    throw new Error(`FAILED: Ahmed's existing lead was transferred to ${verifiedLead?.assigned_to}!`);
  }

  // 2. A follow-up message on Ahmed's conversation arrives
  const { data: followUpRes, error: followUpErr } = await admin.rpc('ingest_inbound_message', {
    p_raw_event_id: null,
    p_channel: 'whatsapp',
    p_external_sender_id: `WA_USER_T6_ORIG_${Date.now()}`,
    p_sender_display_name: 'Existing Customer Ahmed',
    p_sender_phone: '20106666061',
    p_external_thread_id: threadId,
    p_external_message_id: `WA_MSG_T6_FOLLOW_${Date.now()}`,
    p_message_type: 'text',
    p_content: 'Follow-up message while Ahmed is offline',
    p_media_url: null,
    p_business_tz: 'Africa/Cairo',
  });

  if (followUpErr || followUpRes.assigned_to !== ctx.sales1Emp.id) {
    throw new Error(`FAILED: Follow-up hijacked ownership to ${followUpRes.assigned_to}! Expected Ahmed (${ctx.sales1Emp.id})`);
  }

  // 3. A brand NEW lead arrives
  const newThreadId = `test6_new_thread_${Date.now()}`;
  const { data: newLeadRes, error: newLeadErr } = await admin.rpc('ingest_inbound_message', {
    p_raw_event_id: null,
    p_channel: 'whatsapp',
    p_external_sender_id: `WA_USER_T6_NEW_${Date.now()}`,
    p_sender_display_name: 'Brand New Customer',
    p_sender_phone: '20106666062',
    p_external_thread_id: newThreadId,
    p_external_message_id: `WA_MSG_T6_NEW_${Date.now()}`,
    p_message_type: 'text',
    p_content: 'Brand new inquiry',
    p_media_url: null,
    p_business_tz: 'Africa/Cairo',
  });

  if (newLeadErr || !newLeadRes?.lead_id) {
    throw new Error(`Failed to create new lead in Test 6: ${JSON.stringify(newLeadErr)}`);
  }

  cleanupLeadIds.push(newLeadRes.lead_id);
  cleanupConvIds.push(newLeadRes.conversation_id);

  if (newLeadRes.assigned_to !== ctx.sales2Emp.id) {
    throw new Error(`FAILED: New lead should follow availability rules (assigned to online Mohamed), got ${newLeadRes.assigned_to}!`);
  }

  console.log('✅ TEST 6 PASSED: Ahmed retains existing leads; new leads follow availability rules (Mohamed).');
}

// ═══════════════════════════════════════════════════════════════
// TEST 7 — DAILY FAIRNESS
// Create a controlled set of 9 Leads during the same Cairo business day.
// Ahmed, Mohamed, Ziad all Online.
// Verify distribution follows daily-count + rotating tie-break (3 each).
// ═══════════════════════════════════════════════════════════════
async function test7_DailyFairness() {
  console.log('\n[Test 7] Daily Fairness: Ahmed, Mohamed, Ziad Online (9 Leads)');
  await setEmployeeStatus(ctx.adminEmp.id, false);
  await setEmployeeStatus(ctx.sales1Emp.id, true);
  await setEmployeeStatus(ctx.sales2Emp.id, true);
  await setEmployeeStatus(ctx.sales3Emp.id, true);

  const assignedEmployees: string[] = [];

  for (let i = 1; i <= 9; i++) {
    const threadId = `test7_thread_${Date.now()}_${i}`;
    const { data: res, error } = await admin.rpc('ingest_inbound_message', {
      p_raw_event_id: null,
      p_channel: 'whatsapp',
      p_external_sender_id: `WA_USER_T7_${i}_${Date.now()}`,
      p_sender_display_name: `Fairness Cust ${i}`,
      p_sender_phone: `2010555507${i}`,
      p_external_thread_id: threadId,
      p_external_message_id: `WA_MSG_T7_${i}_${Date.now()}`,
      p_message_type: 'text',
      p_content: `Daily fairness lead ${i}`,
      p_media_url: null,
      p_business_tz: 'Africa/Cairo',
    });

    if (error || !res?.lead_id) {
      throw new Error(`Test 7 lead creation failed: ${JSON.stringify(error)}`);
    }

    cleanupLeadIds.push(res.lead_id);
    cleanupConvIds.push(res.conversation_id);
    assignedEmployees.push(res.assigned_to);
  }

  const ahmedCount = assignedEmployees.filter((id) => id === ctx.sales1Emp.id).length;
  const mohamedCount = assignedEmployees.filter((id) => id === ctx.sales2Emp.id).length;
  const ziadCount = assignedEmployees.filter((id) => id === ctx.sales3Emp.id).length;

  console.log(`Results: Ahmed=${ahmedCount}, Mohamed=${mohamedCount}, Ziad=${ziadCount}`);

  if (ahmedCount !== 3 || mohamedCount !== 3 || ziadCount !== 3) {
    throw new Error(`FAILED: Fairness broken! Expected 3, 3, 3, got (${ahmedCount}, ${mohamedCount}, ${ziadCount})!`);
  }

  console.log('✅ TEST 7 PASSED: Perfectly balanced daily distribution (Ahmed=3, Mohamed=3, Ziad=3).');
}

// ═══════════════════════════════════════════════════════════════
// TEST 8 — CONCURRENT INBOUND LEADS
// Create at least 20 concurrent inbound Lead events (21 concurrent leads).
// Verify:
// - no duplicate Leads
// - no duplicate assignments
// - no Admin assignments
// - no unassigned Leads
// - distribution remains fair (7 each across Ahmed, Mohamed, Ziad)
// - no deadlocks
// - no transaction corruption
// ═══════════════════════════════════════════════════════════════
async function test8_ConcurrentInboundLeads() {
  console.log('\n[Test 8] Concurrent Inbound Leads: 21 concurrent inbound leads arriving in a burst');
  await setEmployeeStatus(ctx.adminEmp.id, true); // Admin Online to test Admin exclusion under concurrency!
  await setEmployeeStatus(ctx.sales1Emp.id, true);
  await setEmployeeStatus(ctx.sales2Emp.id, true);
  await setEmployeeStatus(ctx.sales3Emp.id, true);

  const batchSize = 21;
  const promises = Array.from({ length: batchSize }).map((_, i) => {
    const threadId = `test8_conc_thread_${Date.now()}_${i}`;
    return admin.rpc('ingest_inbound_message', {
      p_raw_event_id: null,
      p_channel: 'whatsapp',
      p_external_sender_id: `WA_CONC_USER_${i}_${Date.now()}`,
      p_sender_display_name: `Concurrent Cust ${i}`,
      p_sender_phone: `2010444408${i.toString().padStart(2, '0')}`,
      p_external_thread_id: threadId,
      p_external_message_id: `WA_MSG_T8_${i}_${Date.now()}`,
      p_message_type: 'text',
      p_content: `Concurrent lead msg ${i}`,
      p_media_url: null,
      p_business_tz: 'Africa/Cairo',
    });
  });

  const results = await Promise.all(promises);

  const leadIds = new Set<string>();
  const assignedOwners: string[] = [];

  for (const { data: res, error } of results) {
    if (error || !res?.lead_id) {
      throw new Error(`Concurrency run failed with error: ${JSON.stringify(error)}`);
    }
    leadIds.add(res.lead_id);
    assignedOwners.push(res.assigned_to);
    cleanupLeadIds.push(res.lead_id);
    cleanupConvIds.push(res.conversation_id);
  }

  if (leadIds.size !== batchSize) {
    throw new Error(`FAILED: Expected ${batchSize} distinct leads, got ${leadIds.size}!`);
  }

  const adminHits = assignedOwners.filter((id) => id === ctx.adminEmp.id).length;
  if (adminHits > 0) {
    throw new Error(`FAILED: Admin received ${adminHits} leads under concurrency!`);
  }

  const unassignedHits = assignedOwners.filter((id) => !id).length;
  if (unassignedHits > 0) {
    throw new Error(`FAILED: ${unassignedHits} leads remained unassigned under concurrency!`);
  }

  const s1 = assignedOwners.filter((id) => id === ctx.sales1Emp.id).length;
  const s2 = assignedOwners.filter((id) => id === ctx.sales2Emp.id).length;
  const s3 = assignedOwners.filter((id) => id === ctx.sales3Emp.id).length;

  console.log(`Concurrent assignment results (total ${batchSize}): Ahmed=${s1}, Mohamed=${s2}, Ziad=${s3}, Admin=${adminHits}`);

  // Variance check: for 21 leads across 3 reps, each should receive exactly 7!
  if (s1 !== 7 || s2 !== 7 || s3 !== 7) {
    throw new Error(`FAILED: Uneven distribution under concurrency (${s1}, ${s2}, ${s3}), expected 7 each!`);
  }

  console.log('✅ TEST 8 PASSED: 21 concurrent leads processed safely without deadlock; exactly 7 each (Ahmed=7, Mohamed=7, Ziad=7, Admin=0).');
}

// ═══════════════════════════════════════════════════════════════
// TEST 9 — IDEMPOTENT REPLAY
// Replay the same inbound message/event multiple times.
// Expected: 1 logical inbound message, 1 appropriate Lead, no duplicate Lead assignment.
// ═══════════════════════════════════════════════════════════════
async function test9_IdempotentReplay() {
  console.log('\n[Test 9] Idempotent Replay: Replaying identical inbound event 3 times');
  const threadId = `test9_thread_idem_${Date.now()}`;
  const externalMsgId = `WA_MSG_IDEM_${Date.now()}`;

  const payload = {
    p_raw_event_id: null,
    p_channel: 'whatsapp',
    p_external_sender_id: `WA_IDEM_USER_${Date.now()}`,
    p_sender_display_name: 'Idempotency User',
    p_sender_phone: '20103333091',
    p_external_thread_id: threadId,
    p_external_message_id: externalMsgId,
    p_message_type: 'text',
    p_content: 'Idempotency test message',
    p_media_url: null,
    p_business_tz: 'Africa/Cairo',
  };

  // Run 1 (initial delivery)
  const { data: res1, error: err1 } = await admin.rpc('ingest_inbound_message', payload);
  if (err1) throw new Error(`First ingestion failed: ${JSON.stringify(err1)}`);

  cleanupLeadIds.push(res1.lead_id);
  cleanupConvIds.push(res1.conversation_id);

  // Run 2 (first replay)
  const { data: res2, error: err2 } = await admin.rpc('ingest_inbound_message', payload);
  if (err2) throw new Error(`Second ingestion failed: ${JSON.stringify(err2)}`);

  // Run 3 (second replay)
  const { data: res3, error: err3 } = await admin.rpc('ingest_inbound_message', payload);
  if (err3) throw new Error(`Third ingestion failed: ${JSON.stringify(err3)}`);

  console.log('Run 1 result:', res1);
  console.log('Run 2 replay:', res2);
  console.log('Run 3 replay:', res3);

  if (res2.lead_id !== res1.lead_id || res3.lead_id !== res1.lead_id) {
    throw new Error(`FAILED: Replays created duplicate leads!`);
  }
  if (res2.conversation_id !== res1.conversation_id || res3.conversation_id !== res1.conversation_id) {
    throw new Error(`FAILED: Replays created duplicate conversations!`);
  }
  if (!(res2.is_duplicate || res2.is_duplicate_message) || !(res3.is_duplicate || res3.is_duplicate_message)) {
    throw new Error(`FAILED: Replays were not flagged as duplicate message!`);
  }
  if (res2.assigned_to !== res1.assigned_to || res3.assigned_to !== res1.assigned_to) {
    throw new Error(`FAILED: Replays altered assignment from ${res1.assigned_to}!`);
  }

  // Count messages for conversation
  const { count } = await admin
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', res1.conversation_id);

  if (count !== 1) {
    throw new Error(`FAILED: Expected exactly 1 message in conversation, found ${count}!`);
  }

  console.log('✅ TEST 9 PASSED: Replayed inbound events are perfectly idempotent (1 lead, 1 message, stable assignment).');
}

// ═══════════════════════════════════════════════════════════════
// TEST 10 — SECURITY & SERVER-SIDE ADMIN EXCLUSION
// Verify:
// - Admin cannot become Lead Owner
// - Non-Sales users cannot become Lead Owner
// - Sales users cannot bypass existing RLS
// - Sales user A cannot modify Sales user B's Leads
// ═══════════════════════════════════════════════════════════════
async function test10_Security() {
  console.log('\n[Test 10] Security: Admin Exclusion, Role Enforcement & RLS Isolation');

  // Subtest 10.1: Attempt to assign lead directly to Admin (Database trigger must block)
  const { data: testLead, error: leadErr } = await admin
    .from('leads')
    .insert({
      full_name: 'Security Test Lead',
      email: 'sectest@example.com',
      source: 'manual',
      status: 'in_progress',
      assignment_source: 'manual',
    })
    .select('id')
    .single();

  if (leadErr || !testLead) {
    throw new Error(`Failed to create test lead for security test: ${JSON.stringify(leadErr)}`);
  }
  cleanupLeadIds.push(testLead.id);

  const { error: adminAssignErr } = await admin
    .from('leads')
    .update({ assigned_to: ctx.adminEmp.id })
    .eq('id', testLead.id);

  if (!adminAssignErr) {
    throw new Error(`CRITICAL SECURITY FAILURE: Admin was assigned to a Lead without trigger error!`);
  }

  console.log(`Expected DB trigger rejection for Admin: "${adminAssignErr.message}"`);
  if (!adminAssignErr.message.includes('Lead assignment rejected') || !adminAssignErr.message.includes('Admin')) {
    throw new Error(`Unexpected error message for Admin assignment: ${adminAssignErr.message}`);
  }
  console.log('✅ Subtest 10.1 PASSED: Admin cannot become Lead Owner.');

  // Subtest 10.2: Attempt to assign lead to a non-existent or non-Sales user
  const fakeNonSalesId = '00000000-0000-0000-0000-000000000099';
  const { error: nonSalesAssignErr } = await admin
    .from('leads')
    .update({ assigned_to: fakeNonSalesId })
    .eq('id', testLead.id);

  if (!nonSalesAssignErr) {
    throw new Error(`CRITICAL SECURITY FAILURE: Non-Sales user was assigned to a Lead without trigger error!`);
  }
  console.log(`Expected DB trigger rejection for non-Sales user: "${nonSalesAssignErr.message}"`);
  console.log('✅ Subtest 10.2 PASSED: Non-Sales user cannot become Lead Owner.');

  // Subtest 10.3: RLS Isolation — Assign to Ahmed (Sales 1), verify Mohamed (Sales 2) cannot read or modify
  const { error: salesAssignErr } = await admin
    .from('leads')
    .update({ assigned_to: ctx.sales1Emp.id })
    .eq('id', testLead.id);

  if (salesAssignErr) {
    throw new Error(`Failed to assign lead to Ahmed: ${salesAssignErr.message}`);
  }

  // Set password for Mohamed (Sales 2) to authenticate
  await admin.auth.admin.updateUserById(ctx.sales2Emp.auth_user_id, {
    password: 'TemporarySalesPassword123!',
  });

  const sales2AuthClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: authData, error: signInErr } = await sales2AuthClient.auth.signInWithPassword({
    email: 'sales2@gmail.com',
    password: 'TemporarySalesPassword123!',
  });

  if (signInErr || !authData?.session) {
    throw new Error(`Failed to sign in as Mohamed (Sales 2): ${signInErr?.message}`);
  }

  // 1. Mohamed queries leads: must NOT see Ahmed's lead
  const { data: mohamedLeads, error: selectErr } = await sales2AuthClient
    .from('leads')
    .select('id, assigned_to')
    .eq('id', testLead.id);

  if (selectErr) {
    throw new Error(`Mohamed select query error: ${selectErr.message}`);
  }

  if (mohamedLeads && mohamedLeads.length > 0) {
    throw new Error(`RLS BREACH: Mohamed was able to view Ahmed's lead ${testLead.id}!`);
  }

  // 2. Mohamed attempts to modify Ahmed's lead: must return 0 rows modified
  const { data: updateRes } = await sales2AuthClient
    .from('leads')
    .update({ notes: 'Hacked by Mohamed' })
    .eq('id', testLead.id)
    .select();

  if (updateRes && updateRes.length > 0) {
    throw new Error(`RLS BREACH: Mohamed was able to modify Ahmed's lead!`);
  }

  console.log('✅ Subtest 10.3 PASSED: RLS isolation verified. Mohamed cannot read or modify Ahmed\'s leads.');
  console.log('✅ TEST 10 PASSED: Security, Admin exclusion, role checks, and RLS policies are strictly enforced.');
}

// ═══════════════════════════════════════════════════════════════
// MAIN TEST RUNNER
// ═══════════════════════════════════════════════════════════════
async function runAllTests() {
  console.log('================================================================');
  console.log('   BASIC LEAD DISTRIBUTION SYSTEM — COMPLETE VERIFICATION SUITE ');
  console.log('================================================================');

  try {
    await setupContext();
    await cleanupTestData();

    await test1_OneOnlineSales();
    await cleanupTestData();

    await test2_MultipleOnlineSales();
    await cleanupTestData();

    await test3_AllSalesOffline();
    await cleanupTestData();

    await test4_AdminOnline();
    await cleanupTestData();

    await test5_AdminOnlyOnline();
    await cleanupTestData();

    await test6_ExistingOwnership();
    await cleanupTestData();

    await test7_DailyFairness();
    await cleanupTestData();

    await test8_ConcurrentInboundLeads();
    await cleanupTestData();

    await test9_IdempotentReplay();
    await cleanupTestData();

    await test10_Security();
    await cleanupTestData();

    console.log('\n================================================================');
    console.log('   🎉 ALL 10 MANDATORY TESTS PASSED WITH 100% SUCCESS!         ');
    console.log('================================================================\n');
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err);
    process.exitCode = 1;
  } finally {
    await cleanupTestData();
  }
}

void runAllTests();
