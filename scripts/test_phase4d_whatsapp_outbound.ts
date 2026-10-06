// scripts/test_phase4d_whatsapp_outbound.ts
// Comprehensive Phase 4D: WhatsApp Cloud API Outbound & Unified Inbox QA Suite

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpfhfugcwgcylqoedmge.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
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
        is_online: true,
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

  return { id: emp.id, email, fullName, authUserId: user.id };
}

// Mock Meta Graph API responses
let mockResponseStatusCode = 200;
let mockResponseBody: Record<string, unknown> = {};

let dispatchedUrl = '';
let dispatchedHeaders: Record<string, string> = {};
let dispatchedBody: Record<string, unknown> = {};

// Setup Next.js environment mocks for server action testing
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextCache = require('next/cache');
nextCache.revalidatePath = () => {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentTestSessionClient: any = null;
const serverSupabasePath = require.resolve(path.resolve(process.cwd(), 'src/lib/supabase/server.ts'));
require.cache[serverSupabasePath] = {
  id: serverSupabasePath,
  filename: serverSupabasePath,
  loaded: true,
  exports: {
    createClient: async () => currentTestSessionClient,
  },
} as unknown as NodeModule;

async function runWhatsAppOutboundTestSuite() {
  console.log('======================================================================');
  console.log('🚀 PHASE 4D: WHATSAPP CLOUD API OUTBOUND & REGRESSION QA SUITE');
  console.log('======================================================================\n');

  try {
    const { data: roles } = await admin.from('roles').select('id, name');
    SALES_ROLE_ID = roles?.find((r) => r.name === 'Sales')?.id ?? '';

    // Ensure Sales employees
    const salesRep = await ensureEmployee('sales.outbound@elexir.test', 'Sales Rep Outbound', SALES_ROLE_ID);

    // Create session client
    const salesSession = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    await salesSession.auth.signInWithPassword({ email: 'sales.outbound@elexir.test', password: 'TestPassword123!' });

    // Global fetch interception for Meta Graph API calls
    const originalFetch = globalThis.fetch;
    let wamidSequence = 0;
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const urlStr = url.toString();
      if (urlStr.includes('graph.facebook.com')) {
        dispatchedUrl = urlStr;
        dispatchedHeaders = (init?.headers as Record<string, string>) || {};
        dispatchedBody = JSON.parse((init?.body as string) || '{}');

        let resBody = { ...mockResponseBody };
        if (mockResponseStatusCode === 200 && urlStr.includes('/messages') && !urlStr.includes('/me/messages')) {
          wamidSequence++;
          if (!mockResponseBody.messages) {
            resBody = {
              messaging_product: 'whatsapp',
              contacts: [{ input: dispatchedBody.to, wa_id: dispatchedBody.to }],
              messages: [{ id: `wamid.dynamic_${wamidSequence}_${Date.now()}` }],
              ...mockResponseBody,
            };
          }
        }
        return new Response(JSON.stringify(resBody), {
          status: mockResponseStatusCode,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(url, init);
    };

    // Load server action
    const { sendOutboundReply } = await import('@/app/(dashboard)/crm/inbox-actions');

    // ────────────────────────────────────────────────────────────────
    // 1. WHATSAPP OUTBOUND SUCCESS DISPATCH FLOW
    // ────────────────────────────────────────────────────────────────
    console.log('--- 1. WhatsApp Outbound Success Flow ---');
    await cleanDatabaseState();
    currentTestSessionClient = salesSession;

    const recipientPhone = '201012345678';
    const { data: ident } = await admin.from('channel_identities').insert({
      channel: 'whatsapp',
      external_id: recipientPhone,
      phone: recipientPhone,
      display_name: 'Dr. Test Customer',
    }).select().single();

    const { data: conv } = await admin.from('conversations').insert({
      channel: 'whatsapp',
      external_thread_id: recipientPhone,
      channel_identity_id: ident.id,
      assigned_to: salesRep.id,
      status: 'open',
    }).select().single();

    // Mock successful Meta WhatsApp dispatch
    const testWamid = 'wamid.HBgLMjAxMDEyMzQ1Njc4FQIAERgSRjAzOEU1Rjc0ODc0RDQwMzEA';
    mockResponseStatusCode = 200;
    mockResponseBody = {
      messaging_product: 'whatsapp',
      contacts: [{ input: recipientPhone, wa_id: recipientPhone }],
      messages: [{ id: testWamid }],
    };

    process.env.WHATSAPP_PHONE_NUMBER_ID = '100609346426859';
    process.env.WHATSAPP_ACCESS_TOKEN = 'test_wa_access_token_123';
    process.env.META_API_VERSION = 'v21.0';

    const replyRes = await sendOutboundReply({
      conversation_id: conv.id,
      content: 'Hello! Thank you for contacting El-Exir. How can we help?',
      message_type: 'text',
    });

    recordTest('Outbound Success', 'sendOutboundReply returns success=true', replyRes.success === true, replyRes.error);

    const { data: savedMsg } = await admin.from('messages').select('*').eq('conversation_id', conv.id).order('created_at', { ascending: false }).limit(1).single();
    const { data: updatedConv } = await admin.from('conversations').select('*').eq('id', conv.id).single();

    recordTest('Outbound Success', 'Message saved with direction="outbound" and status="sent"', savedMsg?.direction === 'outbound' && savedMsg?.status === 'sent');
    recordTest('Outbound Success', 'Returned wamid persisted as external_message_id', savedMsg?.external_message_id === testWamid, `external_message_id: ${savedMsg?.external_message_id}`);
    recordTest('Outbound Success', 'Conversation last_message_preview updated', updatedConv?.last_message_preview?.includes('Hello! Thank you for contacting El-Exir'));

    // ────────────────────────────────────────────────────────────────
    // 2. RECIPIENT WA_ID & PHONE_NUMBER_ID URL VERIFICATION
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 2. Request Payload & Meta Graph URL Verification ---');
    recordTest('Payload Verification', 'Target URL contains correct WHATSAPP_PHONE_NUMBER_ID and API version', dispatchedUrl.includes('/v21.0/100609346426859/messages'), `URL: ${dispatchedUrl}`);
    recordTest('Payload Verification', 'Header contains Authorization: Bearer WHATSAPP_ACCESS_TOKEN', dispatchedHeaders['Authorization'] === 'Bearer test_wa_access_token_123');
    recordTest('Payload Verification', 'JSON payload recipient "to" matches customer wa_id', dispatchedBody.to === recipientPhone, `to: ${dispatchedBody.to}`);
    recordTest('Payload Verification', 'JSON payload has messaging_product="whatsapp" and type="text"', dispatchedBody.messaging_product === 'whatsapp' && dispatchedBody.type === 'text');
    recordTest('Payload Verification', 'Message body content matches input', (dispatchedBody.text as Record<string, unknown>)?.body === 'Hello! Thank you for contacting El-Exir. How can we help?');

    // ────────────────────────────────────────────────────────────────
    // 3. META GRAPH API FAILURE HANDLING (E.G. 24-HOUR WINDOW / BAD REQUEST)
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 3. Meta API Failure Handling ---');
    mockResponseStatusCode = 400;
    mockResponseBody = {
      error: {
        message: '(#131047) Message failed to send because more than 24 hours have passed since the customer last replied to this number',
        type: 'OAuthException',
        code: 131047,
        error_subcode: 2494010,
        fbtrace_id: 'AY9374928174',
      },
    };

    const failReplyRes = await sendOutboundReply({
      conversation_id: conv.id,
      content: 'This reply is sent outside the 24-hour window',
      message_type: 'text',
    });

    recordTest('Meta Failure Handling', 'sendOutboundReply returns success=false when Meta rejects message', failReplyRes.success === false);
    recordTest('Meta Failure Handling', 'Error message matches Meta API error description', !!(failReplyRes.error?.includes('131047') || failReplyRes.error?.includes('24 hours')), `Error: ${failReplyRes.error}`);

    const { data: failedMsg } = await admin.from('messages').select('*').eq('conversation_id', conv.id).order('created_at', { ascending: false }).limit(1).single();
    recordTest('Meta Failure Handling', 'Failed message record status="failed" in database', !!(failedMsg?.status === 'failed' && failedMsg?.error_detail?.includes('24 hours')));

    // ────────────────────────────────────────────────────────────────
    // 4. MISSING ENVIRONMENT VARIABLES HANDLING & UNAUTHORIZED ACCESS
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 4. Missing Environment Variables & Authorization ---');
    const originalPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;

    const missingEnvRes = await sendOutboundReply({
      conversation_id: conv.id,
      content: 'Testing missing WHATSAPP_PHONE_NUMBER_ID',
      message_type: 'text',
    });

    recordTest('Missing Env Vars', 'Fails gracefully when WHATSAPP_PHONE_NUMBER_ID is missing', !!(missingEnvRes.success === false && missingEnvRes.error?.includes('WHATSAPP_PHONE_NUMBER_ID')));
    process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneId;

    // Test unauthenticated access fails
    currentTestSessionClient = null;
    const unauthRes = await sendOutboundReply({
      conversation_id: conv.id,
      content: 'Unauthorized outbound reply',
      message_type: 'text',
    });
    recordTest('Authorization', 'Unauthenticated client rejected from sending outbound reply', unauthRes.success === false);
    currentTestSessionClient = salesSession;

    // ────────────────────────────────────────────────────────────────
    // 5. RAPID DUPLICATE SUBMISSION SAFETY
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 5. Duplicate Submission Safety ---');
    mockResponseStatusCode = 200;
    mockResponseBody = {}; // Trigger dynamic wamid per call

    const dupPromises = Array.from({ length: 3 }, (_, i) =>
      sendOutboundReply({
        conversation_id: conv.id,
        content: `Concurrent reply attempt #${i + 1}`,
        message_type: 'text',
      })
    );
    const dupResults = await Promise.all(dupPromises);
    const allDupSuccess = dupResults.every((r) => r.success === true);

    recordTest('Duplicate Safety', 'Concurrent reply calls complete cleanly with distinct message records', allDupSuccess);

    const { data: convMsgs } = await admin.from('messages').select('id, content, status').eq('conversation_id', conv.id).eq('direction', 'outbound').eq('status', 'sent');
    recordTest('Duplicate Safety', 'All dispatched messages tracked accurately with status="sent"', !!(convMsgs && convMsgs.length === 4), `Sent count: ${convMsgs?.length}`);

    // ────────────────────────────────────────────────────────────────
    // 6. MESSENGER OUTBOUND REGRESSION VERIFICATION
    // ────────────────────────────────────────────────────────────────
    console.log('\n--- 6. Messenger Outbound Regression Verification ---');
    const { data: msgrIdent } = await admin.from('channel_identities').insert({
      channel: 'messenger',
      external_id: 'PSID_MSGR_OUTBOUND_TEST',
      display_name: 'Messenger Test User',
    }).select().single();

    const { data: msgrConv } = await admin.from('conversations').insert({
      channel: 'messenger',
      external_thread_id: 'PSID_MSGR_OUTBOUND_TEST',
      channel_identity_id: msgrIdent.id,
      assigned_to: salesRep.id,
      status: 'open',
    }).select().single();

    mockResponseBody = {
      recipient_id: 'PSID_MSGR_OUTBOUND_TEST',
      message_id: 'mid.msgr_outbound_test_123',
    };

    process.env.META_PAGE_ACCESS_TOKEN = 'test_meta_page_token_msgr';

    const msgrReplyRes = await sendOutboundReply({
      conversation_id: msgrConv.id,
      content: 'Hello from CRM via Facebook Messenger!',
      message_type: 'text',
    });

    recordTest('Messenger Regression', 'Messenger outbound reply succeeds with HTTP 200', msgrReplyRes.success === true);
    recordTest('Messenger Regression', 'Messenger target URL calls /me/messages', dispatchedUrl.includes('/me/messages'));

    const { data: msgrSavedMsg } = await admin.from('messages').select('*').eq('conversation_id', msgrConv.id).single();
    recordTest('Messenger Regression', 'Messenger message external_message_id is mid.msgr_outbound_test_123', msgrSavedMsg?.external_message_id === 'mid.msgr_outbound_test_123');

    // Restore fetch
    globalThis.fetch = originalFetch;

    // Clean up
    await cleanDatabaseState();

    console.log('\n======================================================================');
    console.log(`📊 OUTBOUND TEST RESULTS: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
    console.log('======================================================================\n');

    if (failedTests > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Outbound test suite runner crashed:', err);
    process.exit(1);
  }
}

void runWhatsAppOutboundTestSuite();
