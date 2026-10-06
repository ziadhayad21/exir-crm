// scripts/test_phase4c3_whatsapp.ts
// Comprehensive Phase 4C.3: WhatsApp Cloud API Inbound Integration & Adversarial Verification Suite

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpfhfugcwgcylqoedmge.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const WEBHOOK_URL = process.env.TEST_WEBHOOK_URL || 'http://localhost:3000/api/webhooks/inbound';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const META_APP_SECRET = process.env.META_APP_SECRET || 'test_meta_app_secret_12345';
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'test_meta_verify_token_67890';
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || META_VERIFY_TOKEN;
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || META_APP_SECRET;

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

function computeSignature(payloadString: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  return 'sha256=' + hmac.update(payloadString).digest('hex');
}

async function cleanDatabaseState() {
  await admin.from('messages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('conversations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('channel_identities').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('webhook_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('leads').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('employees').update({ is_online: false, last_heartbeat: null }).neq('id', '00000000-0000-0000-0000-000000000000');
}

let SALES_ROLE_ID: string;

async function ensureEmployee(email: string, fullName: string, roleId: string) {
  const { data: authUsers } = await admin.auth.admin.listUsers();
  let user = authUsers?.users?.find((u) => u.email === email);

  if (!user) {
    const { data: newUser, error } = await admin.auth.admin.createUser({
      email,
      password: 'TestPassword123!',
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

  if (roleId) {
    const { data: userRole } = await admin.from('user_roles').select('*').eq('employee_id', emp.id).eq('role_id', roleId).maybeSingle();
    if (!userRole) {
      await admin.from('user_roles').insert({ employee_id: emp.id, role_id: roleId });
    }
  }

  return { id: emp.id, email, fullName };
}

async function runWhatsAppTestSuite() {
  console.log('======================================================================');
  console.log('🚀 PHASE 4C.3: WHATSAPP CLOUD API INBOUND & REGRESSION QA SUITE');
  console.log('======================================================================\n');

  try {
    const { data: roles } = await admin.from('roles').select('id, name');
    SALES_ROLE_ID = roles?.find((r) => r.name === 'Sales')?.id ?? '';

    const ahmed = await ensureEmployee('ahmed.wa4c3@elexir.test', 'Ahmed WhatsApp4C3', SALES_ROLE_ID);
    const mohamed = await ensureEmployee('mohamed.wa4c3@elexir.test', 'Mohamed WhatsApp4C3', SALES_ROLE_ID);

    for (const empId of [ahmed.id, mohamed.id]) {
      await admin.from('user_roles').upsert({ employee_id: empId, role_id: SALES_ROLE_ID }, { onConflict: 'employee_id,role_id' });
    }

    const testSalesIds = [ahmed.id, mohamed.id];

    // ────────────────────────────────────────────────────────────────
    // 1. WHATSAPP WEBHOOK GET VERIFICATION
    // ────────────────────────────────────────────────────────────────
    console.log('--- 1. WhatsApp Webhook GET Verification ---');
    const getSuccessRes = await fetch(`${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${WHATSAPP_VERIFY_TOKEN}&hub.challenge=WA_CHALLENGE_888`);
    const getSuccessText = await getSuccessRes.text();
    recordTest('GET Verification', 'WhatsApp GET subscribe challenge returns HTTP 200 with raw challenge text', getSuccessRes.status === 200 && getSuccessText === 'WA_CHALLENGE_888', `Status: ${getSuccessRes.status}`);

    const getFailRes = await fetch(`${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=INVALID_WA_TOKEN&hub.challenge=WA_CHALLENGE_888`);
    recordTest('GET Verification', 'Invalid verify_token rejected with HTTP 403 Forbidden', getFailRes.status === 403);

    // ────────────────────────────────────────────────────────────────
    // 2. WHATSAPP INBOUND TEXT MESSAGE FLOW
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 2. Single WhatsApp Inbound Text Message Flow ---');
    await cleanDatabaseState();
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).in('id', testSalesIds);

    const phoneNumberId = '100609346426859';
    const waPhone = '201012345678';
    const senderName = 'Ziad Abdallah';
    const midSingle = `wamid.HBgLMjAxMDEyMzQ1Njc4FQIAEhgg${Date.now()}`;
    const singlePayload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        id: 'WHATSAPP_BUSINESS_ACCOUNT_ID_TEST',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '15550254477',
              phone_number_id: phoneNumberId,
            },
            contacts: [{
              profile: { name: senderName },
              wa_id: waPhone,
            }],
            messages: [{
              from: waPhone,
              id: midSingle,
              timestamp: `${Math.floor(Date.now() / 1000)}`,
              text: { body: 'Hello from WhatsApp Cloud API Inbound!' },
              type: 'text',
            }],
          },
          field: 'messages',
        }],
      }],
    });
    const singleSig = computeSignature(singlePayload, WHATSAPP_APP_SECRET);

    const singleRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': singleSig },
      body: singlePayload,
    });
    const singleJson = await singleRes.json();
    recordTest('Single Inbound', 'WhatsApp webhook POST returns HTTP 200 success', singleRes.status === 200 && singleJson.success === true);

    const { data: singleConv } = await admin.from('conversations').select('*').eq('id', singleJson.conversation_id || '').maybeSingle();
    const { data: singleIdentity } = await admin.from('channel_identities').select('*').eq('id', singleConv?.channel_identity_id || '').maybeSingle();
    const { data: singleMsg } = await admin.from('messages').select('*').eq('id', singleJson.message_id || '').maybeSingle();
    const { data: singleLead } = await admin.from('leads').select('*').eq('id', singleConv?.lead_id || '').maybeSingle();

    recordTest('Single Inbound', 'Channel identity channel="whatsapp", external_id and phone set to wa_id', singleIdentity?.channel === 'whatsapp' && singleIdentity?.external_id === waPhone && singleIdentity?.phone === waPhone, `Phone: ${singleIdentity?.phone}`);
    recordTest('Single Inbound', 'Channel identity display_name extracted from contacts[0].profile.name', singleIdentity?.display_name === senderName, `Name: ${singleIdentity?.display_name}`);
    recordTest('Single Inbound', 'Conversation channel="whatsapp" and thread matches wa_id', singleConv?.channel === 'whatsapp' && singleConv?.external_thread_id === waPhone);
    recordTest('Single Inbound', 'Message direction="inbound", content and external_message_id intact', singleMsg?.direction === 'inbound' && singleMsg?.content === 'Hello from WhatsApp Cloud API Inbound!' && singleMsg?.external_message_id === midSingle);
    recordTest('Single Inbound', 'Lead created with source="whatsapp", phone set, and assigned to sales', singleLead?.source === 'whatsapp' && singleLead?.phone === waPhone && singleLead?.full_name === senderName && singleLead?.assigned_to !== null);

    // ────────────────────────────────────────────────────────────────
    // 3. WHATSAPP STATUS UPDATE WEBHOOK (DELIVERY / READ RECEIPTS)
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 3. WhatsApp Status Update Webhooks (Delivery / Read Receipts) ---');
    const statusPayload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        id: 'WHATSAPP_BUSINESS_ACCOUNT_ID_TEST',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '15550254477',
              phone_number_id: phoneNumberId,
            },
            statuses: [{
              id: midSingle,
              status: 'delivered',
              timestamp: `${Math.floor(Date.now() / 1000)}`,
              recipient_id: waPhone,
              conversation: {
                id: 'CONV_META_ID_123',
                expiration_timestamp: `${Math.floor(Date.now() / 1000) + 86400}`,
              },
            }],
          },
          field: 'messages',
        }],
      }],
    });
    const statusSig = computeSignature(statusPayload, WHATSAPP_APP_SECRET);

    const statusRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': statusSig },
      body: statusPayload,
    });
    const statusJson = await statusRes.json();
    recordTest('Status Updates', 'WhatsApp status webhook acknowledged with HTTP 200 ignored reason', statusRes.status === 200 && statusJson.status === 'ignored' && statusJson.reason === 'whatsapp_status_update');

    const { data: msgsAfterStatus } = await admin.from('messages').select('id');
    const { data: leadsAfterStatus } = await admin.from('leads').select('id');
    recordTest('Status Updates', 'Zero duplicate messages/leads created by status webhook', msgsAfterStatus?.length === 1 && leadsAfterStatus?.length === 1, `Msgs: ${msgsAfterStatus?.length}, Leads: ${leadsAfterStatus?.length}`);

    // ────────────────────────────────────────────────────────────────
    // 4. IDEMPOTENCY & BURST DUPLICATE PREVENTION
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 4. Idempotency & 5x Burst Duplicate Prevention ---');
    const dupRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': singleSig },
      body: singlePayload,
    });
    recordTest('Idempotency', 'Single duplicate delivery returns HTTP 200', dupRes.status === 200);

    const burstPromises = Array.from({ length: 5 }, () =>
      fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': singleSig }, body: singlePayload })
    );
    const burstRes = await Promise.all(burstPromises);
    const all200 = burstRes.every((r) => r.status === 200);
    recordTest('Idempotency', '5x burst duplicate deliveries return HTTP 200', all200);

    const { data: dupConvs } = await admin.from('conversations').select('id').eq('channel_identity_id', singleIdentity?.id || '');
    const { data: dupMsgs } = await admin.from('messages').select('id').eq('external_message_id', midSingle);
    recordTest('Idempotency', 'Exactly 1 Conversation and 1 Message in DB across all duplicate bursts', dupConvs?.length === 1 && dupMsgs?.length === 1, `Convs: ${dupConvs?.length}, Msgs: ${dupMsgs?.length}`);

    // ────────────────────────────────────────────────────────────────
    // 5. MULTIPLE CONCURRENT UNIQUE WHATSAPP MESSAGES
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 5. Multiple Concurrent Unique WhatsApp Messages ---');
    await cleanDatabaseState();
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).in('id', testSalesIds);

    const concurCount = 20;
    const concurPromises = Array.from({ length: concurCount }, (_, i) => {
      const waUserPhone = `2010999900${(i + 1).toString().padStart(2, '0')}`;
      const mid = `wamid_concur_${i + 1}_${Date.now()}`;
      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{
          id: 'WHATSAPP_BUSINESS_ACCOUNT_ID_TEST',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550254477', phone_number_id: phoneNumberId },
              contacts: [{ profile: { name: `Customer WA ${i + 1}` }, wa_id: waUserPhone }],
              messages: [{
                from: waUserPhone,
                id: mid,
                timestamp: `${Math.floor(Date.now() / 1000)}`,
                text: { body: `WhatsApp Concurrent Message #${i + 1}` },
                type: 'text',
              }],
            },
            field: 'messages',
          }],
        }],
      });
      const sig = computeSignature(payload, WHATSAPP_APP_SECRET);
      return fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig }, body: payload });
    });

    const concurResults = await Promise.all(concurPromises);
    const concurSuccesses = concurResults.filter((r) => r.status === 200).length;

    const { data: concurLeads } = await admin.from('leads').select('id');
    const { data: concurMsgs } = await admin.from('messages').select('id');

    recordTest(
      'Concurrency',
      '20 concurrent unique WhatsApp messages result in EXACTLY 20 Leads, 20 Messages, 0 lost',
      concurSuccesses === 20 && concurLeads?.length === 20 && concurMsgs?.length === 20,
      `HTTP 200s: ${concurSuccesses}/20, Leads: ${concurLeads?.length}, Messages: ${concurMsgs?.length}`
    );

    // ────────────────────────────────────────────────────────────────
    // 6. OFFLINE SALES → PENDING / UNASSIGNED LEADS
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 6. Offline Sales & Pending Lead Ingestion ---');
    await cleanDatabaseState();
    // All employees offline

    const offlinePromises = Array.from({ length: 5 }, (_, i) => {
      const waUserPhone = `2010888800${(i + 1).toString().padStart(2, '0')}`;
      const mid = `wamid_offline_${i + 1}_${Date.now()}`;
      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{
          id: 'WHATSAPP_BUSINESS_ACCOUNT_ID_TEST',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550254477', phone_number_id: phoneNumberId },
              contacts: [{ profile: { name: `Offline WA User ${i + 1}` }, wa_id: waUserPhone }],
              messages: [{
                from: waUserPhone,
                id: mid,
                timestamp: `${Math.floor(Date.now() / 1000)}`,
                text: { body: `Offline WhatsApp inquiry #${i + 1}` },
                type: 'text',
              }],
            },
            field: 'messages',
          }],
        }],
      });
      const sig = computeSignature(payload, WHATSAPP_APP_SECRET);
      return fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig }, body: payload });
    });

    await Promise.all(offlinePromises);

    const { data: offlineLeads } = await admin.from('leads').select('*').order('received_at', { ascending: true });
    const { data: offlineConvs } = await admin.from('conversations').select('*');

    const allUnassigned = (offlineLeads?.length === 5) && offlineLeads.every((l) => l.assigned_to === null && l.assignment_source === 'unassigned');
    const allPendingConvs = (offlineConvs?.length === 5) && offlineConvs.every((c) => c.status === 'pending_assignment' && c.assigned_to === null);

    recordTest('Offline Handling', 'All 5 WhatsApp leads set to assignment_source="unassigned" with assigned_to=NULL', allUnassigned);
    recordTest('Offline Handling', 'All 5 WhatsApp conversations set to status="pending_assignment"', allPendingConvs);

    // ────────────────────────────────────────────────────────────────
    // 7. ONLINE SALES ASSIGNMENT & CAPACITY LIMIT = 5
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 7. Online Sales Assignment & Capacity Limit = 5 ---');
    await cleanDatabaseState();
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).in('id', testSalesIds);

    // Send 15 WhatsApp messages (Ahmed capacity = 5, Mohamed capacity = 5, 5 in backlog)
    for (let i = 0; i < 15; i++) {
      const waUserPhone = `2010777700${(i + 1).toString().padStart(2, '0')}`;
      const mid = `wamid_cap_${i + 1}_${Date.now()}`;
      const payload = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{
          id: 'WHATSAPP_BUSINESS_ACCOUNT_ID_TEST',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550254477', phone_number_id: phoneNumberId },
              contacts: [{ profile: { name: `Cap WA User ${i + 1}` }, wa_id: waUserPhone }],
              messages: [{
                from: waUserPhone,
                id: mid,
                timestamp: `${Math.floor(Date.now() / 1000)}`,
                text: { body: `Capacity inquiry #${i + 1}` },
                type: 'text',
              }],
            },
            field: 'messages',
          }],
        }],
      });
      const sig = computeSignature(payload, WHATSAPP_APP_SECRET);
      await fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig }, body: payload });
    }

    const { data: capLeads } = await admin.from('leads').select('*');
    const ahmedCount = capLeads?.filter((l) => l.assigned_to === ahmed.id).length || 0;
    const mohamedCount = capLeads?.filter((l) => l.assigned_to === mohamed.id).length || 0;
    const unassignedCount = capLeads?.filter((l) => l.assigned_to === null).length || 0;

    recordTest('Capacity Limit', 'Ahmed received exactly 5 leads (capacity limit 5)', ahmedCount === 5, `Ahmed: ${ahmedCount}`);
    recordTest('Capacity Limit', 'Mohamed received exactly 5 leads (capacity limit 5)', mohamedCount === 5, `Mohamed: ${mohamedCount}`);
    recordTest('Capacity Limit', 'Remaining 5 leads held in unassigned backlog', unassignedCount === 5, `Unassigned: ${unassignedCount}`);

    // ────────────────────────────────────────────────────────────────
    // 8. REGRESSION TESTS: MESSENGER & INSTAGRAM
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 8. Regression Verification: Messenger & Instagram Inbound ---');
    await cleanDatabaseState();
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).in('id', testSalesIds);

    // Messenger inbound
    const msgrMid = `mid_msgr_reg_${Date.now()}`;
    const msgrPayload = JSON.stringify({
      object: 'page',
      entry: [{
        id: '100PAGEID',
        time: Date.now(),
        messaging: [{
          sender: { id: 'PSID_MESSENGER_REG' },
          recipient: { id: '100PAGEID' },
          timestamp: Date.now(),
          message: { mid: msgrMid, text: 'Messenger regression test message' },
        }],
      }],
    });
    const msgrSig = computeSignature(msgrPayload, META_APP_SECRET);
    const msgrRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': msgrSig },
      body: msgrPayload,
    });
    const msgrJson = await msgrRes.json();
    recordTest('Regression', 'Messenger inbound message processes cleanly with HTTP 200', msgrRes.status === 200 && msgrJson.success === true);

    const { data: msgrMsg } = await admin.from('messages').select('*').eq('external_message_id', msgrMid).maybeSingle();
    const { data: msgrConv } = await admin.from('conversations').select('*').eq('id', msgrMsg?.conversation_id || '').maybeSingle();
    recordTest('Regression', 'Messenger conversation channel="messenger" without regression', msgrConv?.channel === 'messenger');

    // Instagram inbound
    const igMid = `mid_ig_reg_${Date.now()}`;
    const igPayload = JSON.stringify({
      object: 'instagram',
      entry: [{
        id: '17841400000000001',
        time: Date.now(),
        messaging: [{
          sender: { id: 'IGSID_INSTAGRAM_REG' },
          recipient: { id: '17841400000000001' },
          timestamp: Date.now(),
          message: { mid: igMid, text: 'Instagram regression test message' },
        }],
      }],
    });
    const igSig = computeSignature(igPayload, META_APP_SECRET);
    const igRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': igSig },
      body: igPayload,
    });
    const igJson = await igRes.json();
    recordTest('Regression', 'Instagram inbound message processes cleanly with HTTP 200', igRes.status === 200 && igJson.success === true);

    const { data: igMsg } = await admin.from('messages').select('*').eq('external_message_id', igMid).maybeSingle();
    const { data: igConv } = await admin.from('conversations').select('*').eq('id', igMsg?.conversation_id || '').maybeSingle();
    recordTest('Regression', 'Instagram conversation channel="instagram" without regression', igConv?.channel === 'instagram');

    // Clean up
    await cleanDatabaseState();

    console.log('\n======================================================================');
    console.log(`📊 TEST RESULTS: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
    console.log('======================================================================\n');

    if (failedTests > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test suite runner crashed:', err);
    process.exit(1);
  }
}

void runWhatsAppTestSuite();
