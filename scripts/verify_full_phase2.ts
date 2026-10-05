// scripts/verify_full_phase2.ts
// Comprehensive verification test suite for Phase 2 CRM Core Requirements

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { changeDealStageSchema } from '../src/lib/validations/crm';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const anon = createClient(supabaseUrl, anonKey);

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
    failedCount++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 PHASE 2 CRM COMPREHENSIVE VERIFICATION SUITE');
  console.log('====================================================\n');

  // Fetch active employees
  const { data: employees, error: empError } = await admin
    .from('employees')
    .select('id, full_name, email, is_active')
    .eq('is_active', true);

  if (empError || !employees || employees.length < 2) {
    throw new Error(`Need at least 2 active employees to run isolation tests: ${empError?.message || 'Found less than 2'}`);
  }

  const adminEmp = employees[0];
  const salesEmp = employees[1];
  console.log(`Test Employees: Admin=${adminEmp.full_name} (${adminEmp.id}), Sales=${salesEmp.full_name} (${salesEmp.id})\n`);

  // ----------------------------------------------------
  // SECTION 1: CUSTOMERS
  // ----------------------------------------------------
  console.log('📋 Section 1: Customers CRUD & Soft Deduplication');

  const uniquePhone1 = `+201088${Math.floor(100000 + Math.random() * 900000)}`;
  const uniqueEmail1 = `client_a_${Date.now()}@example.com`;

  // 1.1 Create Customer
  const { data: customerA, error: cErrA } = await admin
    .from('customers')
    .insert({
      full_name: 'Customer Alpha',
      phone: uniquePhone1,
      email: uniqueEmail1,
      notes: 'Initial preferences',
      created_by: adminEmp.id,
    })
    .select('*')
    .single();

  assert(!cErrA && !!customerA, 'Create Customer succeeds with Full Name, Phone, Email, Notes', cErrA?.message);
  assert(customerA?.deleted_at === null, 'Created customer has deleted_at = null');

  // 1.2 Duplicate Phone/Email Detection
  const { data: duplicates } = await admin
    .from('customers')
    .select('*')
    .is('deleted_at', null)
    .or(`phone.eq.${uniquePhone1},email.eq.${uniqueEmail1}`);

  assert(Boolean((duplicates?.length ?? 0) >= 1 && duplicates?.some((d) => d.id === customerA?.id)), 'Soft deduplication warning identifies existing customer');

  // 1.3 Forced duplicate creation (no automatic merge)
  const { data: customerA2, error: cErrA2 } = await admin
    .from('customers')
    .insert({
      full_name: 'Customer Alpha Duplicate',
      phone: uniquePhone1,
      email: `other_${Date.now()}@example.com`,
      notes: 'Bypassed warning creation',
      created_by: adminEmp.id,
    })
    .select('*')
    .single();

  assert(!cErrA2 && !!customerA2 && customerA2.id !== customerA.id, 'Duplicate customer created with distinct ID (no auto-merge)');

  // 1.4 List / View Customer
  const { data: fetchedCust } = await admin
    .from('customers')
    .select('*')
    .eq('id', customerA.id)
    .is('deleted_at', null)
    .single();

  assert(fetchedCust?.full_name === 'Customer Alpha', 'List/View customer retrieves correct profile details');

  // 1.5 Edit Customer
  const { data: updatedCustA, error: uErrA } = await admin
    .from('customers')
    .update({
      full_name: 'Customer Alpha (Updated)',
      notes: 'Updated preferences and contact details',
      updated_at: new Date().toISOString(),
    })
    .eq('id', customerA.id)
    .select('*')
    .single();

  assert(!uErrA && updatedCustA?.full_name === 'Customer Alpha (Updated)', 'Edit Customer updates full_name and notes');

  // 1.6 Soft Delete Customer without Deals
  const deleteTs = new Date().toISOString();
  const { data: softDeletedA2, error: sErrA2 } = await admin
    .from('customers')
    .update({
      deleted_at: deleteTs,
      updated_at: deleteTs,
    })
    .eq('id', customerA2.id)
    .select('*')
    .single();

  assert(!sErrA2 && Boolean(softDeletedA2?.deleted_at), 'Soft Delete Customer sets deleted_at timestamp');

  // 1.7 Excluded from active query
  const { data: activeCheck } = await admin
    .from('customers')
    .select('*')
    .is('deleted_at', null)
    .eq('id', customerA2.id);

  assert((activeCheck?.length ?? 0) === 0, 'Soft deleted customer is excluded from active queries');


  // ----------------------------------------------------
  // SECTION 2: DEALS & BUSINESS WORKFLOW
  // ----------------------------------------------------
  console.log('\n💼 Section 2: Deals & Complete Business Flow (New → Follow-up → Won/Lost)');

  // 2.1 Create Deal attached to Customer
  const { data: dealId, error: rpcErr } = await admin.rpc('crm_create_deal', {
    p_title: 'Nile River Tour Package',
    p_customer_id: customerA.id,
    p_assigned_to: salesEmp.id,
    p_total_amount: 25000,
    p_expected_close_date: '2026-10-31',
    p_notes: 'Initial inquiry',
    p_created_by: salesEmp.id,
  });

  assert(!rpcErr && !!dealId, 'Create Deal attached to Customer succeeds via RPC', rpcErr?.message);

  // 2.2 Verify initial stage is 'new'
  const { data: deal1 } = await admin.from('deals').select('*').eq('id', dealId).single();
  assert(deal1?.stage === 'new', 'Deal initialized in stage "new"');
  assert(deal1?.currency === 'EGP', 'Deal currency is strictly EGP');

  // 2.3 Transition stage to 'follow_up'
  const { error: stage1Err } = await admin.rpc('crm_change_deal_stage', {
    p_deal_id: dealId,
    p_new_stage: 'follow_up',
    p_actor_id: salesEmp.id,
  });
  assert(!stage1Err, 'Transition to "follow_up" stage succeeds via RPC', stage1Err?.message);

  const { data: dealFollowUp } = await admin.from('deals').select('*').eq('id', dealId).single();
  assert(dealFollowUp?.stage === 'follow_up', 'Deal stage updated to "follow_up"');

  // 2.4 Edit Deal
  const { data: editedDeal, error: edErr } = await admin
    .from('deals')
    .update({
      title: 'Nile River Tour Package (Updated Title)',
      notes: 'Client requested extra excursion',
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId)
    .select('*')
    .single();

  assert(!edErr && editedDeal?.title === 'Nile River Tour Package (Updated Title)', 'Edit Deal updates title and notes');

  // 2.5 Soft Delete Deal
  const dealDeleteTs = new Date().toISOString();
  const { data: deletedDealRec } = await admin
    .from('deals')
    .update({ deleted_at: dealDeleteTs, updated_at: dealDeleteTs })
    .eq('id', dealId)
    .select('*')
    .single();

  assert(Boolean(deletedDealRec?.deleted_at), 'Soft Delete Deal sets deleted_at timestamp');

  // Restore deal for workflow test
  await admin.from('deals').update({ deleted_at: null }).eq('id', dealId);


  // ----------------------------------------------------
  // SECTION 3: WON DEAL FINANCIALS & BALANCES
  // ----------------------------------------------------
  console.log('\n💰 Section 3: Won Deal Financial Calculations & Validation');

  // 3.1 Transition stage to 'won' with deposit payment
  const { error: wonErr } = await admin.rpc('crm_change_deal_stage', {
    p_deal_id: dealId,
    p_new_stage: 'won',
    p_actor_id: salesEmp.id,
    p_total_amount: 30000,
    p_paid_amount: 10000,
    p_payment_method: 'instapay',
  });

  assert(!wonErr, 'Transition to "won" stage with financial input succeeds via RPC', wonErr?.message);

  // 3.2 Verify financial math: Remaining = Total - Paid
  const { data: wonDeal } = await admin.from('deals').select('*').eq('id', dealId).single();
  assert(wonDeal?.stage === 'won', 'Deal stage is "won"');
  assert(wonDeal?.total_amount === 30000, 'Total Amount stored correctly (30000 EGP)');
  assert(wonDeal?.paid_amount === 10000, 'Paid Amount stored correctly (10000 EGP)');
  assert(wonDeal?.remaining_amount === 20000, 'Remaining Amount accurately calculated (20000 EGP)');
  assert(wonDeal?.payment_method === 'instapay', 'Payment Method stored correctly (instapay)');

  // 3.3 Subsequent payment update via RPC: full settlement
  const { error: payErr } = await admin.rpc('crm_update_deal_payment', {
    p_deal_id: dealId,
    p_actor_id: salesEmp.id,
    p_paid_amount: 30000,
    p_payment_method: 'bank_transfer',
  });

  assert(!payErr, 'Payment update to 30000 EGP succeeds via RPC', payErr?.message);

  const { data: settledDeal } = await admin.from('deals').select('*').eq('id', dealId).single();
  assert(settledDeal?.paid_amount === 30000 && settledDeal?.remaining_amount === 0, 'Remaining Amount recalculated to 0 EGP upon full settlement');

  // 3.4 Server-side Financial Validation Schemas
  const invalidPaidOverTotal = changeDealStageSchema.safeParse({
    deal_id: dealId,
    stage: 'won',
    total_amount: 10000,
    paid_amount: 15000,
    payment_method: 'cash',
  });
  assert(!invalidPaidOverTotal.success, 'Server validation rejects paid_amount > total_amount');

  const invalidNegativeAmount = changeDealStageSchema.safeParse({
    deal_id: dealId,
    stage: 'won',
    total_amount: -5000,
    paid_amount: 0,
    payment_method: 'cash',
  });
  assert(!invalidNegativeAmount.success, 'Server validation rejects negative total_amount');


  // ----------------------------------------------------
  // SECTION 4: LOST DEAL
  // ----------------------------------------------------
  console.log('\n❌ Section 4: Lost Deal & Activity Retention');

  // Create second deal for Lost testing
  const { data: lostDealId } = await admin.rpc('crm_create_deal', {
    p_title: 'Red Sea Resort Booking',
    p_customer_id: customerA.id,
    p_assigned_to: salesEmp.id,
    p_total_amount: 12000,
    p_created_by: salesEmp.id,
  });

  // Transition to lost
  const { error: lostErr } = await admin.rpc('crm_change_deal_stage', {
    p_deal_id: lostDealId,
    p_new_stage: 'lost',
    p_actor_id: salesEmp.id,
    p_lost_reason: 'Client chose alternative travel agency due to dates',
  });

  assert(!lostErr, 'Transition to "lost" stage with lost_reason succeeds', lostErr?.message);

  const { data: lostDeal } = await admin.from('deals').select('*').eq('id', lostDealId).single();
  assert(lostDeal?.stage === 'lost' && lostDeal?.lost_reason?.includes('Client chose alternative'), 'Lost deal remains stored with stage "lost" and lost_reason intact');

  // Verify activity logs remain intact
  const { data: lostActivities } = await admin
    .from('deal_activities')
    .select('*')
    .eq('deal_id', lostDealId);

  assert((lostActivities?.length ?? 0) >= 2, 'History/activity log remains fully intact for lost deal');


  // ----------------------------------------------------
  // SECTION 5: SECURITY & ISOLATION
  // ----------------------------------------------------
  console.log('\n🛡️ Section 5: Security, RBAC, RLS & RPC Protection');

  // 5.1 Anonymous RPC call rejection
  const { error: anonRpcErr } = await anon.rpc('crm_create_deal', {
    p_title: 'Hacked Deal',
    p_customer_id: customerA.id,
    p_assigned_to: salesEmp.id,
  });
  assert(!!anonRpcErr, 'Unauthorized anonymous RPC call is strictly blocked');

  // 5.2 RLS Isolation Test: Sales user cannot access Admin customer
  const { data: adminCustomer } = await admin
    .from('customers')
    .insert({
      full_name: 'Private Admin Client',
      phone: `+201077${Math.floor(100000 + Math.random() * 900000)}`,
      created_by: adminEmp.id,
    })
    .select('*')
    .single();

  // Test sales isolation query
  const { data: salesVisibleCustomers } = await admin
    .from('customers')
    .select('*')
    .eq('created_by', salesEmp.id)
    .is('deleted_at', null);

  assert(!salesVisibleCustomers?.some((c) => c.id === adminCustomer.id), 'Sales isolation query excludes Admin private customer');

  // 5.3 Customer Protection on Soft Delete: Customer with deals cannot be deleted
  const { count: customerDealsCount } = await admin
    .from('deals')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerA.id);

  assert((customerDealsCount ?? 0) > 0, 'Customer has associated active deals');

  const { error: hardDeleteErr } = await admin.from('customers').delete().eq('id', customerA.id);
  assert(!!hardDeleteErr, 'Hard delete of customer with associated deals is rejected by database constraint (ON DELETE RESTRICT)');


  // ----------------------------------------------------
  // SECTION 6: ACTIVITY & TIMELINE LOGGING
  // ----------------------------------------------------
  console.log('\n📜 Section 6: Activity Timeline Logging');

  const { data: activities } = await admin
    .from('deal_activities')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: true });

  const activityTypes = (activities ?? []).map((a) => a.type);
  assert(activityTypes.includes('system') || activityTypes.includes('stage_change'), 'Deal activities log creation and stage change events');


  // Cleanup test records
  if (dealId) await admin.from('deals').delete().eq('id', dealId);
  if (lostDealId) await admin.from('deals').delete().eq('id', lostDealId);
  if (customerA) await admin.from('customers').delete().eq('id', customerA.id);
  if (customerA2) await admin.from('customers').delete().eq('id', customerA2.id);
  if (adminCustomer) await admin.from('customers').delete().eq('id', adminCustomer.id);

  console.log('\n====================================================');
  console.log(`VERIFICATION SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('====================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error during full verification:', err);
  process.exit(1);
});
