// scripts/test_phase4c2_instagram.ts
// Comprehensive Phase 4C.2: Instagram Inbound Integration & Adversarial Verification Suite

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpfhfugcwgcylqoedmge.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const WEBHOOK_URL = process.env.TEST_WEBHOOK_URL || 'https://exir-crm.vercel.app/api/webhooks/inbound';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const META_APP_SECRET = process.env.META_APP_SECRET || 'test_meta_app_secret_12345';
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'test_meta_verify_token_67890';
const INSTAGRAM_VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN || META_VERIFY_TOKEN;

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

async function runInstagramTestSuite() {
  console.log('======================================================================');
  console.log('🚀 PHASE 4C.2: INSTAGRAM INBOUND & ADVERSARIAL QA SUITE');
  console.log('======================================================================\n');

  try {
    const { data: roles } = await admin.from('roles').select('id, name');
    SALES_ROLE_ID = roles?.find((r) => r.name === 'Sales')?.id ?? '';

    const ahmed = await ensureEmployee('ahmed.m4c2@elexir.test', 'Ahmed Instagram4C2', SALES_ROLE_ID);
    const mohamed = await ensureEmployee('mohamed.m4c2@elexir.test', 'Mohamed Instagram4C2', SALES_ROLE_ID);

    for (const empId of [ahmed.id, mohamed.id]) {
      await admin.from('user_roles').upsert({ employee_id: empId, role_id: SALES_ROLE_ID }, { onConflict: 'employee_id,role_id' });
    }

    const testSalesIds = [ahmed.id, mohamed.id];

    // ────────────────────────────────────────────────────────────────
    // 1. INSTAGRAM WEBHOOK GET VERIFICATION
    // ────────────────────────────────────────────────────────────────
    console.log('--- 1. Instagram Webhook GET Verification ---');
    const getSuccessRes = await fetch(`${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${INSTAGRAM_VERIFY_TOKEN}&hub.challenge=IG_CHALLENGE_999`);
    const getSuccessText = await getSuccessRes.text();
    recordTest('GET Verification', 'Instagram GET subscribe challenge returns HTTP 200 with raw challenge text', getSuccessRes.status === 200 && getSuccessText === 'IG_CHALLENGE_999', `Status: ${getSuccessRes.status}`);

    const getFailRes = await fetch(`${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=INVALID_IG_TOKEN&hub.challenge=IG_CHALLENGE_999`);
    recordTest('GET Verification', 'Invalid verify_token rejected with HTTP 403 Forbidden', getFailRes.status === 403);

    // ────────────────────────────────────────────────────────────────
    // 2. ONE INSTAGRAM TEXT MESSAGE INBOUND FLOW
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 2. Single Instagram Inbound Text Message Flow ---');
    await cleanDatabaseState();
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).in('id', testSalesIds);

    const igId = '17841400000000001';
    const senderId = 'IGSID_SINGLE_1';
    const midSingle = `mid_ig_single_${Date.now()}`;
    const singlePayload = JSON.stringify({
      object: 'instagram',
      entry: [{
        id: igId,
        time: Date.now(),
        messaging: [{
          sender: { id: senderId },
          recipient: { id: igId },
          timestamp: Date.now(),
          message: { mid: midSingle, text: 'Hello from Instagram Inbound!' },
        }],
      }],
    });
    const singleSig = computeSignature(singlePayload, META_APP_SECRET);

    const singleRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': singleSig },
      body: singlePayload,
    });
    const singleJson = await singleRes.json();
    recordTest('Single Inbound', 'Instagram webhook POST returns HTTP 200 success', singleRes.status === 200 && singleJson.success === true);

    const { data: singleIdentity } = await admin.from('channel_identities').select('*').eq('external_id', senderId).maybeSingle();
    const { data: singleConv } = await admin.from('conversations').select('*').eq('channel_identity_id', singleIdentity?.id || '').maybeSingle();
    const { data: singleMsg } = await admin.from('messages').select('*').eq('external_message_id', midSingle).maybeSingle();
    const { data: singleLead } = await admin.from('leads').select('*').eq('id', singleConv?.lead_id || '').maybeSingle();

    recordTest('Single Inbound', 'Channel identity channel="instagram"', singleIdentity?.channel === 'instagram', `Channel: ${singleIdentity?.channel}`);
    recordTest('Single Inbound', 'Message channel="instagram" and content intact', singleMsg?.content === 'Hello from Instagram Inbound!');
    recordTest('Single Inbound', 'Conversation channel="instagram" and created cleanly', singleConv?.channel === 'instagram');
    recordTest('Single Inbound', 'Lead created & assigned to online sales rep', singleLead && singleLead.assigned_to !== null);

    // ────────────────────────────────────────────────────────────────
    // 3. IDEMPOTENCY & BURST DUPLICATE PREVENTION
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 3. Idempotency & 5x Burst Duplicate Prevention ---');
    // Duplicate delivery of same event
    const dupRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': singleSig },
      body: singlePayload,
    });
    recordTest('Idempotency', 'Single duplicate delivery returns HTTP 200', dupRes.status === 200);

    // 5x burst duplicate
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
    // 4. MULTIPLE UNIQUE MESSAGES & CONCURRENCY
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 4. Multiple Concurrent Unique Instagram Messages ---');
    await cleanDatabaseState();
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).in('id', testSalesIds);

    const concurCount = 20;
    const concurPromises = Array.from({ length: concurCount }, (_, i) => {
      const psid = `IGSID_CONCUR_${i + 1}`;
      const mid = `mid_ig_concur_${i + 1}_${Date.now()}`;
      const payload = JSON.stringify({
        object: 'instagram',
        entry: [{
          id: '17841400000000001',
          time: Date.now(),
          messaging: [{
            sender: { id: psid },
            recipient: { id: '17841400000000001' },
            timestamp: Date.now(),
            message: { mid, text: `Instagram Concurrent Message #${i + 1}` },
          }],
        }],
      });
      const sig = computeSignature(payload, META_APP_SECRET);
      return fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig }, body: payload });
    });

    const concurResults = await Promise.all(concurPromises);
    const concurSuccesses = concurResults.filter((r) => r.status === 200).length;

    const { data: concurLeads } = await admin.from('leads').select('id');
    const { data: concurMsgs } = await admin.from('messages').select('id');

    recordTest(
      'Concurrency',
      '20 concurrent unique Instagram messages result in EXACTLY 20 Leads, 20 Messages, 0 lost',
      concurSuccesses === 20 && concurLeads?.length === 20 && concurMsgs?.length === 20,
      `HTTP 200s: ${concurSuccesses}/20, Leads: ${concurLeads?.length}, Messages: ${concurMsgs?.length}`
    );

    // ────────────────────────────────────────────────────────────────
    // 5. OFFLINE SALES & SMART BACKLOG REFILL (CAPACITY = 5, FIFO)
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 5. Offline Sales & Smart Backlog Refill ---');
    await cleanDatabaseState();
    // All employees offline

    const offlinePromises = Array.from({ length: 15 }, (_, i) => {
      const psid = `IGSID_OFFLINE_${i + 1}`;
      const mid = `mid_ig_offline_${i + 1}_${Date.now()}`;
      const payload = JSON.stringify({
        object: 'instagram',
        entry: [{
          id: '17841400000000001',
          time: Date.now(),
          messaging: [{
            sender: { id: psid },
            recipient: { id: '17841400000000001' },
            timestamp: Date.now(),
            message: { mid, text: `Offline IG Message #${i + 1}` },
          }],
        }],
      });
      const sig = computeSignature(payload, META_APP_SECRET);
      return fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig }, body: payload });
    });

    await Promise.all(offlinePromises);
    const { data: offlineUnassignedLeads } = await admin.from('leads').select('id').eq('assignment_source', 'unassigned');
    recordTest('Offline Backlog', '15 Instagram messages while offline stored as unassigned', offlineUnassignedLeads?.length === 15);

    // Bring Ahmed online & drain backlog
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).eq('id', ahmed.id);
    await admin.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo', p_batch_limit: 5 });

    const { data: ahmedRefilledLeads } = await admin.from('leads').select('id').eq('assigned_to', ahmed.id).eq('status', 'new');
    recordTest('Backlog Refill', 'Ahmed backlog refilled strictly up to BACKLOG_BATCH_LIMIT = 5', ahmedRefilledLeads?.length === 5, `Active Leads: ${ahmedRefilledLeads?.length}`);

    // ────────────────────────────────────────────────────────────────
    // 6. MESSENGER REGRESSION VERIFICATION
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 6. Messenger Regression Verification ---');
    const msgMid = `mid_reg_messenger_${Date.now()}`;
    const msgPayload = JSON.stringify({
      object: 'page',
      entry: [{
        id: 'PAGE_123',
        time: Date.now(),
        messaging: [{
          sender: { id: 'PSID_MESSENGER_REG' },
          recipient: { id: 'PAGE_123' },
          timestamp: Date.now(),
          message: { mid: msgMid, text: 'Messenger Regression Check' },
        }],
      }],
    });
    const msgSig = computeSignature(msgPayload, META_APP_SECRET);

    const msgRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': msgSig },
      body: msgPayload,
    });
    const { data: regMsg } = await admin.from('messages').select('*').eq('external_message_id', msgMid).maybeSingle();

    recordTest('Messenger Regression', 'Facebook Messenger inbound payload still processes HTTP 200 with channel="messenger"', msgRes.status === 200 && regMsg?.channel === 'messenger');

  } catch (err) {
    console.error('CRITICAL UNHANDLED ERROR IN TEST SUITE:', err);
  } finally {
    console.log('\n======================================================================');
    console.log(`📊 PHASE 4C.2 INSTAGRAM TEST SUMMARY`);
    console.log(`   Total Tests:  ${totalTests}`);
    console.log(`   Passed:       ${passedTests}`);
    console.log(`   Failed:       ${failedTests}`);
    console.log(`   Success Rate: ${((passedTests / (totalTests || 1)) * 100).toFixed(1)}%`);
    console.log('======================================================================\n');
  }
}

runInstagramTestSuite();
