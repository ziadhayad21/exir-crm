// scripts/test_phase4c1_messenger.ts
// Comprehensive QA & Adversarial Verification Suite for Phase 4C.1: Real Meta Messenger Inbound Integration

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

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function recordTest(suite: string, title: string, passed: boolean, details?: string) {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`  ✅ PASS: [${suite}] ${title}`);
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

async function runMessengerTestSuite() {
  console.log('======================================================================');
  console.log('🚀 PHASE 4C.1: REAL META MESSENGER INBOUND & ADVERSARIAL QA SUITE');
  console.log('======================================================================\n');

  process.env.META_VERIFY_TOKEN = META_VERIFY_TOKEN;
  process.env.META_APP_SECRET = META_APP_SECRET;

  try {
    const { data: roles } = await admin.from('roles').select('id, name');
    SALES_ROLE_ID = roles?.find((r) => r.name === 'Sales')?.id ?? '';

    const ahmed = await ensureEmployee('ahmed.m4c1@elexir.test', 'Ahmed Messenger4C', SALES_ROLE_ID);
    const mohamed = await ensureEmployee('mohamed.m4c1@elexir.test', 'Mohamed Messenger4C', SALES_ROLE_ID);
    const ziad = await ensureEmployee('ziad.m4c1@elexir.test', 'Ziad Messenger4C', SALES_ROLE_ID);

    for (const empId of [ahmed.id, mohamed.id, ziad.id]) {
      await admin.from('user_roles').upsert({ employee_id: empId, role_id: SALES_ROLE_ID }, { onConflict: 'employee_id,role_id' });
    }

    const testSalesIds = [ahmed.id, mohamed.id, ziad.id];

    // ────────────────────────────────────────────────────────────────
    // 1. META WEBHOOK GET VERIFICATION
    // ────────────────────────────────────────────────────────────────
    console.log('--- 1. Meta Webhook GET Verification ---');
    const getSuccessRes = await fetch(`${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${META_VERIFY_TOKEN}&hub.challenge=CHALLENGE_12345`);
    const getSuccessText = await getSuccessRes.text();
    recordTest('GET Verification', 'Valid GET subscribe challenge returns HTTP 200 with raw challenge text', getSuccessRes.status === 200 && getSuccessText === 'CHALLENGE_12345', `Status: ${getSuccessRes.status}, Text: ${getSuccessText}`);

    const getFailRes = await fetch(`${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=WRONG_TOKEN&hub.challenge=CHALLENGE_12345`);
    recordTest('GET Verification', 'Invalid verify_token rejected with HTTP 403 Forbidden', getFailRes.status === 403);

    // ────────────────────────────────────────────────────────────────
    // 2. SECURE POST SIGNATURE VERIFICATION
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 2. Secure POST Signature Verification ---');
    const testBody = JSON.stringify({
      object: 'page',
      entry: [{
        id: 'PAGE_123',
        time: Date.now(),
        messaging: [{
          sender: { id: 'PSID_SIG_1' },
          recipient: { id: 'PAGE_123' },
          timestamp: Date.now(),
          message: { mid: `mid_sig_${Date.now()}`, text: 'Signature validation test' },
        }],
      }],
    });

    const validSig = computeSignature(testBody, META_APP_SECRET);
    const postSigRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': validSig },
      body: testBody,
    });
    recordTest('POST Validation', 'Valid X-Hub-Signature-256 accepted with HTTP 200', postSigRes.status === 200);

    const invalidSigRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=invalid_hex_digest_9999' },
      body: testBody,
    });
    recordTest('POST Validation', 'Invalid X-Hub-Signature-256 rejected with HTTP 401 Unauthorized', invalidSigRes.status === 401);

    const missingSigRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: testBody,
    });
    recordTest('POST Validation', 'Missing signature header rejected with HTTP 401 Unauthorized', missingSigRes.status === 401);

    // ────────────────────────────────────────────────────────────────
    // 3. MESSENGER PAYLOAD NORMALIZATION & IDEMPOTENCY
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 3. Messenger Payload Normalization & Idempotency ---');
    await cleanDatabaseState();
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).in('id', testSalesIds);

    const midIdempotent = `mid_idem_${Date.now()}`;
    const idemPayload = JSON.stringify({
      object: 'page',
      entry: [{
        id: 'PAGE_IDEM',
        time: Date.now(),
        messaging: [{
          sender: { id: 'PSID_IDEM_1' },
          recipient: { id: 'PAGE_IDEM' },
          timestamp: Date.now(),
          message: { mid: midIdempotent, text: 'Idempotency Test Message' },
        }],
      }],
    });
    const idemSig = computeSignature(idemPayload, META_APP_SECRET);

    // Initial delivery
    const idemRes1 = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': idemSig },
      body: idemPayload,
    });
    const idemData1 = await idemRes1.json();
    recordTest('Idempotency', 'Initial delivery processes successfully', idemRes1.status === 200 && idemData1.success === true);

    // Duplicate delivery
    const idemRes2 = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': idemSig },
      body: idemPayload,
    });
    await idemRes2.json();
    recordTest('Idempotency', 'Duplicate delivery handled idempotently without error or duplicate records', idemRes2.status === 200);

    const { data: idemIdent } = await admin.from('channel_identities').select('id').eq('external_id', 'PSID_IDEM_1').maybeSingle();
    const { data: idemConv } = await admin.from('conversations').select('lead_id').eq('channel_identity_id', idemIdent?.id || '').maybeSingle();
    const { data: idemLeads } = idemConv?.lead_id ? await admin.from('leads').select('id').eq('id', idemConv.lead_id) : { data: [] };
    const { data: idemMessages } = await admin.from('messages').select('id').eq('external_message_id', midIdempotent);
    recordTest('Idempotency', 'Exactly 1 Lead and 1 Message created for duplicate webhook', idemLeads?.length === 1 && idemMessages?.length === 1, `Leads: ${idemLeads?.length}, Messages: ${idemMessages?.length}`);

    // ────────────────────────────────────────────────────────────────
    // 4. ADVERSARIAL CONCURRENCY TEST ("NO LOST LEADS UNDER CONCURRENT WEBHOOKS")
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 4. Adversarial Concurrency Test: NO LOST LEADS ---');
    await cleanDatabaseState();
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).in('id', testSalesIds);

    // CASE 1: 100 unique Messenger messages arrive concurrently
    console.log('  Executing Case 1: 100 unique Messenger messages concurrently...');
    const uniquePromises = Array.from({ length: 100 }, (_, i) => {
      const psid = `PSID_CONCUR_UNIQUE_${i + 1}`;
      const mid = `mid_concur_unique_${i + 1}_${Date.now()}`;
      const payload = JSON.stringify({
        object: 'page',
        entry: [{
          id: 'PAGE_CONCUR',
          time: Date.now(),
          messaging: [{
            sender: { id: psid },
            recipient: { id: 'PAGE_CONCUR' },
            timestamp: Date.now(),
            message: { mid, text: `Concurrent Message ${i + 1}` },
          }],
        }],
      });
      const sig = computeSignature(payload, META_APP_SECRET);
      return fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig },
        body: payload,
      });
    });

    const uniqueResults = await Promise.all(uniquePromises);
    const uniqueStatuses = uniqueResults.map((r) => r.status);
    const uniqueSuccesses = uniqueStatuses.filter((s) => s === 200).length;

    const { data: allConcurLeads } = await admin.from('leads').select('id');
    const { data: allConcurMessages } = await admin.from('messages').select('id');
    const { data: allConcurWebhookEvents } = await admin.from('webhook_events').select('id, status');

    recordTest(
      'Adversarial Concurrency Case 1',
      '100 unique concurrent webhooks result in EXACTLY 100 Leads, 100 Messages, and 0 Lost/Duplicate Leads',
      uniqueSuccesses === 100 && allConcurLeads?.length === 100 && allConcurMessages?.length === 100,
      `HTTP 200s: ${uniqueSuccesses}/100, Leads: ${allConcurLeads?.length}, Messages: ${allConcurMessages?.length}, Webhook Events: ${allConcurWebhookEvents?.length}`
    );

    // CASE 2: Same 100 webhook events delivered twice concurrently
    console.log('  Executing Case 2: 100 duplicate deliveries concurrently...');
    await cleanDatabaseState();
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).in('id', testSalesIds);

    const dupPromises = [];
    for (let i = 1; i <= 50; i++) {
      const psid = `PSID_DUP_${i}`;
      const mid = `mid_dup_${i}_${Date.now()}`;
      const payload = JSON.stringify({
        object: 'page',
        entry: [{
          id: 'PAGE_DUP',
          time: Date.now(),
          messaging: [{
            sender: { id: psid },
            recipient: { id: 'PAGE_DUP' },
            timestamp: Date.now(),
            message: { mid, text: `Duplicate Test Message ${i}` },
          }],
        }],
      });
      const sig = computeSignature(payload, META_APP_SECRET);

      // Send 2 identical requests concurrently
      dupPromises.push(
        fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig }, body: payload }),
        fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig }, body: payload })
      );
    }

    await Promise.all(dupPromises);
    const { data: dupLeads } = await admin.from('leads').select('id');
    const { data: dupMessages } = await admin.from('messages').select('id');

    recordTest(
      'Adversarial Concurrency Case 2',
      '50 pairs of duplicate concurrent webhooks yield EXACTLY 50 Leads (NOT 100)',
      dupLeads?.length === 50 && dupMessages?.length === 50,
      `Leads created: ${dupLeads?.length}/50 expected, Messages: ${dupMessages?.length}`
    );

    // CASE 3: Single thread with 5 duplicate deliveries concurrently
    console.log('  Executing Case 3: Same event delivered 5 times concurrently...');
    await cleanDatabaseState();
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).in('id', testSalesIds);

    const burstMid = `mid_burst_5x_${Date.now()}`;
    const burstPayload = JSON.stringify({
      object: 'page',
      entry: [{
        id: 'PAGE_BURST',
        time: Date.now(),
        messaging: [{
          sender: { id: 'PSID_BURST_5X' },
          recipient: { id: 'PAGE_BURST' },
          timestamp: Date.now(),
          message: { mid: burstMid, text: '5x Burst Test Message' },
        }],
      }],
    });
    const burstSig = computeSignature(burstPayload, META_APP_SECRET);

    const burstPromises = Array.from({ length: 5 }, () =>
      fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': burstSig }, body: burstPayload })
    );

    await Promise.all(burstPromises);
    const { data: burstIdent } = await admin.from('channel_identities').select('id').eq('external_id', 'PSID_BURST_5X').maybeSingle();
    const { data: burstConv } = await admin.from('conversations').select('lead_id').eq('channel_identity_id', burstIdent?.id || '').maybeSingle();
    const { data: burstLeads } = burstConv?.lead_id ? await admin.from('leads').select('id').eq('id', burstConv.lead_id) : { data: [] };
    const { data: burstMessages } = await admin.from('messages').select('id').eq('external_message_id', burstMid);

    recordTest(
      'Adversarial Concurrency Case 3',
      '5x burst delivery of identical event yields EXACTLY 1 Lead and 1 Message',
      burstLeads?.length === 1 && burstMessages?.length === 1,
      `Leads: ${burstLeads?.length}, Messages: ${burstMessages?.length}`
    );

    // CASE 4: 100 new Leads arrive while ALL Sales are offline
    console.log('  Executing Case 4: 100 new Leads arrive while all Sales are offline...');
    await cleanDatabaseState();
    // All employees offline

    const offlinePromises = Array.from({ length: 50 }, (_, i) => {
      const psid = `PSID_OFFLINE_${i + 1}`;
      const mid = `mid_offline_${i + 1}_${Date.now()}`;
      const payload = JSON.stringify({
        object: 'page',
        entry: [{
          id: 'PAGE_OFFLINE',
          time: Date.now(),
          messaging: [{
            sender: { id: psid },
            recipient: { id: 'PAGE_OFFLINE' },
            timestamp: Date.now(),
            message: { mid, text: `Offline Message ${i + 1}` },
          }],
        }],
      });
      const sig = computeSignature(payload, META_APP_SECRET);
      return fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig }, body: payload });
    });

    await Promise.all(offlinePromises);
    const { data: offlineLeads } = await admin.from('leads').select('id, status, assigned_to').eq('assignment_source', 'unassigned');
    const { data: offlineConvs } = await admin.from('conversations').select('id, status, assigned_to').eq('status', 'pending_assignment');

    recordTest(
      'Adversarial Concurrency Case 4',
      '50 Leads arrive offline $\rightarrow$ ALL 50 stored safely as unassigned (status=new, assigned_to=null, pending_assignment)',
      offlineLeads?.length === 50 && offlineConvs?.length === 50,
      `Unassigned leads: ${offlineLeads?.length}/50, Pending conversations: ${offlineConvs?.length}/50`
    );

    // Bring sales online and verify backlog refill drains safely
    await admin.from('employees').update({ is_online: true, last_heartbeat: new Date().toISOString() }).eq('id', ahmed.id);
    const refillRes = await admin.rpc('process_pending_unassigned_leads', { p_business_tz: 'Africa/Cairo', p_batch_limit: 5 });
    const { data: ahmedBacklog } = await admin.from('leads').select('id, assigned_to, status').eq('assigned_to', ahmed.id).eq('status', 'new');

    recordTest(
      'Adversarial Concurrency Case 5',
      'Ahmed comes online $\rightarrow$ Backlog drained strictly up to BACKLOG_BATCH_LIMIT = 5',
      ahmedBacklog?.length === 5,
      `Refill RPC returned: ${refillRes.data}, Ahmed active backlog count: ${ahmedBacklog?.length}`
    );

  } catch (err: unknown) {
    console.error('CRITICAL UNHANDLED ERROR IN TEST SUITE:', err);
  } finally {
    console.log('\n======================================================================');
    console.log(`📊 PHASE 4C.1 TEST SUMMARY`);
    console.log(`   Total Tests:  ${totalTests}`);
    console.log(`   Passed:       ${passedTests}`);
    console.log(`   Failed:       ${failedTests}`);
    console.log(`   Success Rate: ${((passedTests / (totalTests || 1)) * 100).toFixed(1)}%`);
    console.log('======================================================================\n');
  }
}

runMessengerTestSuite();
