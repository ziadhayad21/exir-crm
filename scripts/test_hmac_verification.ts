// scripts/test_hmac_verification.ts
// Mandatory HMAC Verification Test Suite for Meta Messenger & Instagram Webhooks

import crypto from 'crypto';
import { verifyMetaSignature } from '../src/lib/messaging/meta-adapter';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const TEST_SECRET = 'test_meta_app_secret_12345';

function computeSignature(payloadString: string, secret: string, prefix = 'sha256='): string {
  const hmac = crypto.createHmac('sha256', secret);
  return prefix + hmac.update(payloadString, 'utf-8').digest('hex');
}

let total = 0;
let passed = 0;
let failed = 0;

function assertHmacTest(title: string, condition: boolean, details?: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${title}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${title}${details ? ` - ${details}` : ''}`);
  }
}

function runHmacTestSuite() {
  console.log('======================================================================');
  console.log('🧪 MANDATORY HMAC VERIFICATION TEST SUITE');
  console.log('======================================================================\n');

  const rawBodyA = JSON.stringify({
    object: 'page',
    entry: [{ id: '123', time: 1600000000, messaging: [{ sender: { id: 'PSID_1' }, text: 'Hello World' }] }],
  });

  const rawBodyB = JSON.stringify({
    object: 'instagram',
    entry: [{ id: '456', time: 1600000000, messaging: [{ sender: { id: 'IGSID_1' }, text: 'Hello Instagram' }] }],
  });

  const validSigA = computeSignature(rawBodyA, TEST_SECRET);
  const validSigB = computeSignature(rawBodyB, TEST_SECRET);

  // Case A: Valid signature (exact raw body, correct secret)
  assertHmacTest('Case A1: Messenger valid signature passes', verifyMetaSignature(rawBodyA, validSigA, TEST_SECRET));
  assertHmacTest('Case A2: Instagram valid signature passes', verifyMetaSignature(rawBodyB, validSigB, TEST_SECRET));

  // Case B: Invalid signature (modified signature string)
  const invalidSig = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';
  assertHmacTest('Case B: Invalid signature hex rejected', !verifyMetaSignature(rawBodyA, invalidSig, TEST_SECRET));

  // Case C: Modified body (signature for A sent with body B)
  assertHmacTest('Case C: Modified body with signature of another body rejected', !verifyMetaSignature(rawBodyB, validSigA, TEST_SECRET));

  // Case D: JSON formatting preservation (whitespace / formatting differences)
  const prettyBody = JSON.stringify(JSON.parse(rawBodyA), null, 2);
  const prettySig = computeSignature(prettyBody, TEST_SECRET);
  assertHmacTest('Case D1: Signature matches exact raw formatted string', verifyMetaSignature(prettyBody, prettySig, TEST_SECRET));
  assertHmacTest('Case D2: Compact signature rejected against pretty-printed body', !verifyMetaSignature(prettyBody, validSigA, TEST_SECRET));

  // Case E: Missing signature
  assertHmacTest('Case E: Missing signature header rejected', !verifyMetaSignature(rawBodyA, '', TEST_SECRET));

  // Case F: Malformed signature (e.g. missing sha256= prefix or wrong length)
  const rawHexNoPrefix = computeSignature(rawBodyA, TEST_SECRET, '');
  assertHmacTest('Case F1: Signature without sha256= prefix accepted if hex matches', verifyMetaSignature(rawBodyA, rawHexNoPrefix, TEST_SECRET));
  assertHmacTest('Case F2: Truncated signature rejected', !verifyMetaSignature(rawBodyA, 'sha256=12345', TEST_SECRET));

  // Case G: Wrong secret
  assertHmacTest('Case G: Signature verified with wrong secret rejected', !verifyMetaSignature(rawBodyA, validSigA, 'wrong_secret_key_99999'));

  console.log('\n======================================================================');
  console.log(`📊 HMAC SUITE SUMMARY: ${passed}/${total} Passed (${((passed / total) * 100).toFixed(1)}%)`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runHmacTestSuite();
