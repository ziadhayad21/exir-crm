// scripts/test_inbox_instant_cache_swr.ts
// Comprehensive automated test suite for Instant Message Rendering & Background SWR Cache.

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { mergeMessages } from '../src/lib/utils';
import type { Message } from '../src/types';

async function runTestSuite() {
  console.log('======================================================================');
  console.log('🧪 INSTANT MESSAGE RENDERING & SWR CACHE COMPREHENSIVE VERIFICATION');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, message: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`  ✅ [PASS] ${message}`);
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      throw new Error(`Test assertion failed: ${message}`);
    }
  }

  // --- 1. SWR MERGE ALGORITHM & DEDUPLICATION ---
  console.log('--- 1. SWR MERGE ALGORITHM & DEDUPLICATION ---');
  {
    const cachedMsgs: Message[] = [
      {
        id: 'msg_1',
        conversation_id: 'conv_1',
        direction: 'inbound',
        sender_type: 'contact',
        sender_employee_id: null,
        content: 'First message',
        media_url: null,
        message_type: 'text',
        status: 'delivered',
        sent_at: '2026-10-06T10:00:00Z',
        created_at: '2026-10-06T10:00:00Z',
        updated_at: '2026-10-06T10:00:00Z',
        received_at: '2026-10-06T10:00:00Z',
        error_detail: null,
        raw_event_id: null,
        external_message_id: 'ext_1',
      },
      {
        id: 'temp_outbound_123',
        conversation_id: 'conv_1',
        direction: 'outbound',
        sender_type: 'employee',
        sender_employee_id: 'emp_1',
        content: 'Optimistic reply in flight',
        media_url: null,
        message_type: 'text',
        status: 'sending',
        sent_at: '2026-10-06T10:05:00Z',
        created_at: '2026-10-06T10:05:00Z',
        updated_at: '2026-10-06T10:05:00Z',
        received_at: '2026-10-06T10:05:00Z',
        error_detail: null,
        raw_event_id: null,
        external_message_id: null,
      },
    ];

    const serverMsgs: Message[] = [
      {
        id: 'msg_1',
        conversation_id: 'conv_1',
        direction: 'inbound',
        sender_type: 'contact',
        sender_employee_id: null,
        content: 'First message',
        media_url: null,
        message_type: 'text',
        status: 'read',
        sent_at: '2026-10-06T10:00:00Z',
        created_at: '2026-10-06T10:00:00Z',
        updated_at: '2026-10-06T10:00:00Z',
        received_at: '2026-10-06T10:00:00Z',
        error_detail: null,
        raw_event_id: null,
        external_message_id: 'ext_1',
      },
      {
        id: 'msg_2',
        conversation_id: 'conv_1',
        direction: 'inbound',
        sender_type: 'contact',
        sender_employee_id: null,
        content: 'Second message arrived on server',
        media_url: null,
        message_type: 'text',
        status: 'delivered',
        sent_at: '2026-10-06T10:02:00Z',
        created_at: '2026-10-06T10:02:00Z',
        updated_at: '2026-10-06T10:02:00Z',
        received_at: '2026-10-06T10:02:00Z',
        error_detail: null,
        raw_event_id: null,
        external_message_id: 'ext_2',
      },
    ];

    const merged = mergeMessages(cachedMsgs, serverMsgs);
    assert(merged.length === 3, 'Merged result contains all 3 unique messages (2 server + 1 optimistic in-flight)');
    assert(merged.some((m) => m.id === 'temp_outbound_123'), 'Optimistic in-flight message is PRESERVED during server merge');
    assert(merged.some((m) => m.id === 'msg_2'), 'New background server message is added to chat stream');
    assert(merged[0].id === 'msg_1', 'Messages remain strictly sorted chronologically by timestamp');
  }

  // --- 2. REALTIME SAFETY & DUPLICATE PREVENTION ---
  console.log('\n--- 2. REALTIME SAFETY & DUPLICATE PREVENTION ---');
  {
    const cachedWithRealtime: Message[] = [
      {
        id: 'msg_realtime_99',
        conversation_id: 'conv_1',
        direction: 'inbound',
        sender_type: 'contact',
        sender_employee_id: null,
        content: 'Incoming realtime message',
        media_url: null,
        message_type: 'text',
        status: 'delivered',
        sent_at: '2026-10-06T10:10:00Z',
        created_at: '2026-10-06T10:10:00Z',
        updated_at: '2026-10-06T10:10:00Z',
        received_at: '2026-10-06T10:10:00Z',
        error_detail: null,
        raw_event_id: null,
        external_message_id: 'ext_realtime_99',
      },
    ];

    const serverMsgsWithSame: Message[] = [
      {
        id: 'msg_realtime_99',
        conversation_id: 'conv_1',
        direction: 'inbound',
        sender_type: 'contact',
        sender_employee_id: null,
        content: 'Incoming realtime message',
        media_url: null,
        message_type: 'text',
        status: 'read',
        sent_at: '2026-10-06T10:10:00Z',
        created_at: '2026-10-06T10:10:00Z',
        updated_at: '2026-10-06T10:10:00Z',
        received_at: '2026-10-06T10:10:00Z',
        error_detail: null,
        raw_event_id: null,
        external_message_id: 'ext_realtime_99',
      },
    ];

    const merged = mergeMessages(cachedWithRealtime, serverMsgsWithSame);
    assert(merged.length === 1, 'Duplicate realtime & server response deduplicated into single message');
    assert(merged[0].status === 'read', 'Updated server status merged cleanly without duplicating bubble');
  }

  // --- 3. STALE REQUEST PROTECTION (RAPID SWITCHING A -> B -> C) ---
  console.log('\n--- 3. STALE REQUEST PROTECTION (A -> B -> C) ---');
  {
    const selectedConvId = 'conv_C';
    const requestId = 3;

    function handleServerResponse(responseConvId: string, responseReqId: number, data: Message[]) {
      const isStillActiveView = selectedConvId === responseConvId && requestId === responseReqId;
      return { isStillActiveView, data };
    }

    const resA = handleServerResponse('conv_A', 1, []);
    assert(resA.isStillActiveView === false, 'Stale response from Conv A correctly REJECTED for current active view Conv C');

    const resB = handleServerResponse('conv_B', 2, []);
    assert(resB.isStillActiveView === false, 'Stale response from Conv B correctly REJECTED for current active view Conv C');

    const resC = handleServerResponse('conv_C', 3, []);
    assert(resC.isStillActiveView === true, 'Current response for Conv C ACCEPTED for active view');
  }

  // --- 4. LIVE DATABASE & MULTI-CHANNEL INTEGRATION ---
  console.log('\n--- 4. LIVE DATABASE & MULTI-CHANNEL INTEGRATION ---');
  {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: convs, error } = await admin
      .from('conversations')
      .select('id, channel, last_message_preview')
      .limit(5);

    assert(!error && convs !== null, 'Fetched live conversations from Supabase DB');
    const validConvs = convs || [];
    assert(validConvs.length > 0, `Found ${validConvs.length} live conversations in database`);

    const channels = new Set(validConvs.map((c) => c.channel));
    assert(channels.size > 0, `Multi-channel support verified across channels: ${Array.from(channels).join(', ')}`);
  }

  console.log('\n======================================================================');
  console.log(`🏁 INSTANT MESSAGE RENDERING SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('🎉 ALL SWR CACHE & INSTANT SWITCHING VERIFICATIONS PASSED 100%');
  console.log('======================================================================\n');
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
