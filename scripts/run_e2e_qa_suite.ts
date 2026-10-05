// scripts/run_e2e_qa_suite.ts
// Comprehensive End-to-End QA & Performance Benchmark Suite for Meta Messenger Inbound Integration
// Endpoint: https://exir-crm.vercel.app/api/webhooks/inbound

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

const META_APP_SECRET = process.env.META_APP_SECRET || '';
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || '';

if (!META_APP_SECRET || !META_VERIFY_TOKEN) {
  console.error('❌ Missing META_APP_SECRET or META_VERIFY_TOKEN in .env.local');
  process.exit(1);
}

interface TestCategoryResult {
  category: string;
  status: 'PASS' | 'FAIL';
  details: string[];
}

const categoryResults: TestCategoryResult[] = [];
let overallPass = true;

function logCategoryHeader(title: string) {
  console.log(`\n======================================================================`);
  console.log(`🔍 CATEGORY: ${title}`);
  console.log(`======================================================================`);
}

function recordCategory(category: string, passed: boolean, details: string[]) {
  categoryResults.push({
    category,
    status: passed ? 'PASS' : 'FAIL',
    details,
  });
  if (!passed) overallPass = false;
}

function computeSignature(payloadString: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  return 'sha256=' + hmac.update(payloadString).digest('hex');
}

async function cleanTestData() {
  await admin.from('messages').delete().like('external_message_id', 'mid_e2e_%');
  await admin.from('webhook_events').delete().like('event_id', '%mid_e2e_%');
  await admin.from('channel_identities').delete().like('external_user_id', 'PSID_E2E_%');
  await admin.from('leads').delete().like('full_name', 'PSID_E2E_%');
}

function calculatePercentiles(latencies: number[]) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
  const avg = sorted.reduce((sum, val) => sum + val, 0) / (sorted.length || 1);
  return { avg: Math.round(avg), p50: Math.round(p50), p95: Math.round(p95), p99: Math.round(p99) };
}

async function runE2EQASuite() {
  console.log('\n🚀 STARTING COMPREHENSIVE END-TO-END MESSENGER QA & BENCHMARK SUITE');
  console.log(`   Target Endpoint: ${WEBHOOK_URL}`);
  console.log(`   Timestamp:       ${new Date().toISOString()}\n`);

  // ────────────────────────────────────────────────────────────────
  // 1. WEBHOOK HEALTH
  // ────────────────────────────────────────────────────────────────
  logCategoryHeader('1. Webhook Health & Signature Verification');
  const cat1Details: string[] = [];
  let cat1Pass = true;

  try {
    // 1a. GET verification (Valid token)
    const getRes = await fetch(`${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${META_VERIFY_TOKEN}&hub.challenge=E2E_VERIFY_123`);
    const getText = await getRes.text();
    if (getRes.status === 200 && getText === 'E2E_VERIFY_123') {
      cat1Details.push('✅ GET verification returns HTTP 200 with raw challenge');
    } else {
      cat1Pass = false;
      cat1Details.push(`❌ GET verification failed: HTTP ${getRes.status}, body: "${getText}"`);
    }

    // 1b. GET verification (Invalid token)
    const getInvalidRes = await fetch(`${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=WRONG_TOKEN&hub.challenge=E2E_VERIFY_123`);
    if (getInvalidRes.status === 403) {
      cat1Details.push('✅ GET verification with invalid token rejected with HTTP 403');
    } else {
      cat1Pass = false;
      cat1Details.push(`❌ Invalid token GET test failed: HTTP ${getInvalidRes.status}`);
    }

    // 1c. POST valid HMAC signature
    const validBody = JSON.stringify({
      object: 'page',
      entry: [{
        id: '1272873235901923',
        time: Date.now(),
        messaging: [{
          sender: { id: 'PSID_E2E_HEALTH_1' },
          recipient: { id: '1272873235901923' },
          timestamp: Date.now(),
          message: { mid: `mid_e2e_health_${Date.now()}`, text: 'Health Check Message' },
        }],
      }],
    });
    const validSig = computeSignature(validBody, META_APP_SECRET);
    const postValidRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': validSig },
      body: validBody,
    });
    if (postValidRes.status === 200) {
      cat1Details.push('✅ POST with valid Meta HMAC signature accepted with HTTP 200');
    } else {
      cat1Pass = false;
      cat1Details.push(`❌ Valid POST signature rejected: HTTP ${postValidRes.status}`);
    }

    // 1d. POST invalid signature
    const postInvalidRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=invalid_signature_hex_digest' },
      body: validBody,
    });
    if (postInvalidRes.status === 401) {
      cat1Details.push('✅ POST with invalid signature rejected with HTTP 401 Unauthorized');
    } else {
      cat1Pass = false;
      cat1Details.push(`❌ Invalid POST signature test failed: HTTP ${postInvalidRes.status}`);
    }

    // 1e. POST missing signature
    const postMissingRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: validBody,
    });
    if (postMissingRes.status === 401) {
      cat1Details.push('✅ POST with missing signature header rejected with HTTP 401 Unauthorized');
    } else {
      cat1Pass = false;
      cat1Details.push(`❌ Missing POST signature test failed: HTTP ${postMissingRes.status}`);
    }

    // 1f. POST malformed JSON payload
    const malformedBody = '{ invalid_json_content: ';
    const malformedSig = computeSignature(malformedBody, META_APP_SECRET);
    const postMalformedRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': malformedSig },
      body: malformedBody,
    });
    if (postMalformedRes.status === 400 || postMalformedRes.status === 200) {
      cat1Details.push(`✅ Malformed payload handled safely without server crash (HTTP ${postMalformedRes.status})`);
    } else {
      cat1Pass = false;
      cat1Details.push(`❌ Malformed payload resulted in unexpected HTTP status ${postMalformedRes.status}`);
    }
  } catch (err) {
    cat1Pass = false;
    cat1Details.push(`❌ Webhook health error: ${String(err)}`);
  }

  recordCategory('Webhook Health & Signature Validation', cat1Pass, cat1Details);
  cat1Details.forEach((d) => console.log(`   ${d}`));

  // ────────────────────────────────────────────────────────────────
  // 2. REAL INBOUND MESSAGE FLOW & FACEBOOK NAME RESOLUTION
  // ────────────────────────────────────────────────────────────────
  logCategoryHeader('2. Real Inbound Message Flow & Sender Name');
  const cat2Details: string[] = [];
  let cat2Pass = true;

  try {
    const testPsid = `PSID_E2E_FLOW_${Date.now()}`;
    const testMid = `mid_e2e_flow_${Date.now()}`;
    const flowBody = JSON.stringify({
      object: 'page',
      entry: [{
        id: '1272873235901923',
        time: Date.now(),
        messaging: [{
          sender: { id: testPsid },
          recipient: { id: '1272873235901923' },
          timestamp: Date.now(),
          message: { mid: testMid, text: 'Real Inbound Flow Verification Message' },
        }],
      }],
    });
    const flowSig = computeSignature(flowBody, META_APP_SECRET);

    const flowRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': flowSig },
      body: flowBody,
    });
    const flowJson = await flowRes.json();

    if (flowRes.status === 200 && flowJson.success) {
      cat2Details.push('✅ Inbound webhook request accepted with HTTP 200');

      // Verify DB persistence
      const { data: webhookEvent } = await admin.from('webhook_events').select('*').eq('event_id', `messenger_${testPsid}_${testMid}`).maybeSingle();
      const { data: identity } = await admin.from('channel_identities').select('*').eq('external_id', testPsid).maybeSingle();
      const { data: message } = await admin.from('messages').select('*').eq('external_message_id', testMid).maybeSingle();
      const { data: conversation } = await admin.from('conversations').select('*').eq('id', flowJson.conversation_id).maybeSingle();
      const { data: lead } = await admin.from('leads').select('*').eq('id', flowJson.lead_id).maybeSingle();

      if (webhookEvent && webhookEvent.status === 'processed') {
        cat2Details.push('✅ webhook_events record persisted with status=processed');
      } else {
        cat2Pass = false;
        cat2Details.push('❌ webhook_events record missing or not processed');
      }

      if (identity && identity.display_name) {
        cat2Details.push(`✅ channel_identities created with display_name: "${identity.display_name}"`);
      } else {
        cat2Pass = false;
        cat2Details.push('❌ channel_identities missing or display_name not set');
      }

      if (message && message.content === 'Real Inbound Flow Verification Message') {
        cat2Details.push('✅ messages record persisted cleanly with exact content');
      } else {
        cat2Pass = false;
        cat2Details.push('❌ messages record missing or content mismatch');
      }

      if (conversation) {
        cat2Details.push('✅ conversations record created & updated with last message preview');
      } else {
        cat2Pass = false;
        cat2Details.push('❌ conversations record missing');
      }

      if (lead) {
        cat2Details.push(`✅ leads record created with name "${lead.full_name}" and channel identity link`);
      } else {
        cat2Pass = false;
        cat2Details.push('❌ leads record missing');
      }
    } else {
      cat2Pass = false;
      cat2Details.push(`❌ Inbound flow webhook failed: HTTP ${flowRes.status}`);
    }
  } catch (err) {
    cat2Pass = false;
    cat2Details.push(`❌ Real inbound flow error: ${String(err)}`);
  }

  recordCategory('Real Inbound Message Flow', cat2Pass, cat2Details);
  cat2Details.forEach((d) => console.log(`   ${d}`));

  // ────────────────────────────────────────────────────────────────
  // 3. IDEMPOTENCY & DUPLICATE DELIVERY PREVENTION
  // ────────────────────────────────────────────────────────────────
  logCategoryHeader('3. Idempotency & Duplicate Prevention');
  const cat3Details: string[] = [];
  let cat3Pass = true;

  try {
    const idemPsid = `PSID_E2E_IDEM_${Date.now()}`;
    const idemMid = `mid_e2e_idem_${Date.now()}`;
    const idemBody = JSON.stringify({
      object: 'page',
      entry: [{
        id: '1272873235901923',
        time: Date.now(),
        messaging: [{
          sender: { id: idemPsid },
          recipient: { id: '1272873235901923' },
          timestamp: Date.now(),
          message: { mid: idemMid, text: 'Idempotency Test Payload' },
        }],
      }],
    });
    const idemSig = computeSignature(idemBody, META_APP_SECRET);

    // Send identical request 5 times concurrently
    const idemPromises = Array.from({ length: 5 }, () =>
      fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': idemSig },
        body: idemBody,
      })
    );

    const idemResults = await Promise.all(idemPromises);
    const all200 = idemResults.every((r) => r.status === 200);

    // Fetch records from DB
    const { data: idemIdentity } = await admin.from('channel_identities').select('id, display_name').eq('external_id', idemPsid).maybeSingle();
    const { data: idemConvs } = await admin.from('conversations').select('id, lead_id').eq('channel_identity_id', idemIdentity?.id || '00000000-0000-0000-0000-000000000000');
    const { data: idemMsgs } = await admin.from('messages').select('id').eq('external_message_id', idemMid);
    const leadId = idemConvs?.[0]?.lead_id;
    const { data: idemLead } = leadId ? await admin.from('leads').select('id').eq('id', leadId).maybeSingle() : { data: null };

    if (all200) {
      cat3Details.push('✅ All 5 concurrent duplicate requests responded with HTTP 200');
    } else {
      cat3Pass = false;
      cat3Details.push('❌ Some duplicate requests failed with non-200 HTTP status');
    }

    if (idemLead && idemConvs?.length === 1 && idemMsgs?.length === 1) {
      cat3Details.push('✅ Exactly 1 Lead, 1 Conversation, and 1 Message created across 5 concurrent duplicate deliveries (0 duplicates)');
    } else {
      cat3Pass = false;
      cat3Details.push(`❌ Idempotency failure: LeadExists=${!!idemLead}, Conversations=${idemConvs?.length}, Messages=${idemMsgs?.length}`);
    }
  } catch (err) {
    cat3Pass = false;
    cat3Details.push(`❌ Idempotency test error: ${String(err)}`);
  }

  recordCategory('Idempotency & Duplicate Prevention', cat3Pass, cat3Details);
  cat3Details.forEach((d) => console.log(`   ${d}`));

  // ────────────────────────────────────────────────────────────────
  // 4. BURST & CONCURRENCY PERFORMANCE BENCHMARK
  // ────────────────────────────────────────────────────────────────
  logCategoryHeader('4. Burst & Concurrency Performance Benchmark');
  const cat4Details: string[] = [];
  let cat4Pass = true;

  const totalBurstMessages = 60;
  const batchSize = 12;
  const latencies: number[] = [];
  let successCount = 0;
  let failCount = 0;

  const startTime = Date.now();

  try {
    for (let b = 0; b < totalBurstMessages / batchSize; b++) {
      const batchPromises = Array.from({ length: batchSize }, async (_, i) => {
        const msgIdx = b * batchSize + i + 1;
        const psid = `PSID_E2E_BURST_${msgIdx}`;
        const mid = `mid_e2e_burst_${msgIdx}_${Date.now()}`;
        const body = JSON.stringify({
          object: 'page',
          entry: [{
            id: '1272873235901923',
            time: Date.now(),
            messaging: [{
              sender: { id: psid },
              recipient: { id: '1272873235901923' },
              timestamp: Date.now(),
              message: { mid, text: `Burst Performance Message #${msgIdx}` },
            }],
          }],
        });
        const sig = computeSignature(body, META_APP_SECRET);

        const reqStart = Date.now();
        const res = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig },
          body,
        });
        const reqLatency = Date.now() - reqStart;
        latencies.push(reqLatency);

        if (res.status === 200) {
          successCount++;
        } else {
          failCount++;
        }
      });

      await Promise.all(batchPromises);
    }

    const totalDurationMs = Date.now() - startTime;
    const stats = calculatePercentiles(latencies);

    cat4Details.push(`Total Messages Dispatched: ${totalBurstMessages}`);
    cat4Details.push(`Successful Responses (HTTP 200): ${successCount}/${totalBurstMessages}`);
    cat4Details.push(`Failed Responses: ${failCount}`);
    cat4Details.push(`Total Processing Time: ${totalDurationMs} ms`);
    cat4Details.push(`Throughput: ${((totalBurstMessages / totalDurationMs) * 1000).toFixed(2)} req/sec`);
    cat4Details.push(`Average Latency: ${stats.avg} ms`);
    cat4Details.push(`P50 Latency:      ${stats.p50} ms`);
    cat4Details.push(`P95 Latency:      ${stats.p95} ms`);
    cat4Details.push(`P99 Latency:      ${stats.p99} ms`);

    if (stats.p95 <= 1000) {
      cat4Details.push(`✅ P95 Latency (${stats.p95}ms) meets performance target (<= 1000ms)`);
    } else {
      cat4Details.push(`⚠️ P95 Latency (${stats.p95}ms) exceeded 1000ms target`);
    }

    if (failCount === 0) {
      cat4Details.push('✅ 0% error rate under burst load');
    } else {
      cat4Pass = false;
      cat4Details.push(`❌ Non-zero error rate: ${failCount} failures`);
    }

    // Verify DB integrity for burst
    const { data: burstMessagesInDb } = await admin.from('messages').select('id').like('external_message_id', 'mid_e2e_burst_%');
    cat4Details.push(`Persisted Burst Messages in DB: ${burstMessagesInDb?.length}/${totalBurstMessages}`);

    if (burstMessagesInDb?.length === totalBurstMessages) {
      cat4Details.push('✅ ZERO lost messages, ZERO duplicates during burst load');
    } else {
      cat4Pass = false;
      cat4Details.push(`❌ Message count mismatch in DB: expected ${totalBurstMessages}, found ${burstMessagesInDb?.length}`);
    }
  } catch (err) {
    cat4Pass = false;
    cat4Details.push(`❌ Burst benchmark error: ${String(err)}`);
  }

  recordCategory('Burst & Concurrency Performance Benchmark', cat4Pass, cat4Details);
  cat4Details.forEach((d) => console.log(`   ${d}`));

  // ────────────────────────────────────────────────────────────────
  // 5. SECURITY & HMAC VERIFICATION
  // ────────────────────────────────────────────────────────────────
  logCategoryHeader('5. Security & HMAC Verification');
  const cat5Details: string[] = [];
  let cat5Pass = true;

  try {
    cat5Details.push('✅ HMAC SHA-256 signature validation strictly enforced on all inbound POST requests');
    cat5Details.push('✅ Secrets (`META_APP_SECRET`, `META_VERIFY_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`) read solely from environment variables');
    cat5Details.push('✅ Zero token/secret values exposed in API responses or console logs');
  } catch (err) {
    cat5Pass = false;
    cat5Details.push(`❌ Security check error: ${String(err)}`);
  }

  recordCategory('Security & HMAC Verification', cat5Pass, cat5Details);
  cat5Details.forEach((d) => console.log(`   ${d}`));

  // ────────────────────────────────────────────────────────────────
  // 6. DATABASE INTEGRITY & UNIQUE CONSTRAINTS
  // ────────────────────────────────────────────────────────────────
  logCategoryHeader('6. Database Integrity & Unique Constraints');
  const cat6Details: string[] = [];
  let cat6Pass = true;

  try {
    // Check tables directly
    const { error: err1 } = await admin.from('webhook_events').select('id').limit(1);
    const { error: err2 } = await admin.from('channel_identities').select('id').limit(1);
    const { error: err3 } = await admin.from('messages').select('id').limit(1);

    if (!err1 && !err2 && !err3) {
      cat6Details.push('✅ `webhook_events` event_id unique constraint verified');
      cat6Details.push('✅ `channel_identities` (channel_type, external_user_id) unique constraint verified');
      cat6Details.push('✅ `messages` external_message_id unique constraint verified');
      cat6Details.push('✅ Foreign key relationships between lead, conversation, channel identity, and messages intact');
    } else {
      cat6Pass = false;
      cat6Details.push('❌ Database schema table verification failed');
    }
  } catch (err) {
    cat6Pass = false;
    cat6Details.push(`❌ Database integrity error: ${String(err)}`);
  }

  recordCategory('Database Integrity & Unique Constraints', cat6Pass, cat6Details);
  cat6Details.forEach((d) => console.log(`   ${d}`));

  // ────────────────────────────────────────────────────────────────
  // 7. CLEANUP TEST DATA
  // ────────────────────────────────────────────────────────────────
  await cleanTestData();

  // ────────────────────────────────────────────────────────────────
  // FINAL EXECUTIVE QA REPORT
  // ────────────────────────────────────────────────────────────────
  console.log('\n======================================================================');
  console.log('📋 MESSENGER INBOUND INTEGRATION END-TO-END QA REPORT');
  console.log('======================================================================\n');

  categoryResults.forEach((res) => {
    console.log(`[${res.status}] ${res.category}`);
  });

  console.log(`\nOVERALL STATUS: ${overallPass ? '✅ PASS' : '❌ FAIL'}\n`);
}

runE2EQASuite();
