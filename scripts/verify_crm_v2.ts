// scripts/verify_crm_v2.ts
// Comprehensive verification test suite for CRM Business Model Alignment

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import {
  createDealSchema,
  changeDealStageSchema,
  updateDealPaymentSchema,
} from '../src/lib/validations/crm';

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
  console.log('🚀 CRM V2 BUSINESS ALIGNMENT VERIFICATION SUITE');
  console.log('====================================================\n');

  // Fetch active employees for testing
  const { data: employees, error: empError } = await admin
    .from('employees')
    .select('id, full_name, email, is_active')
    .eq('is_active', true);

  if (empError || !employees || employees.length === 0) {
    throw new Error(`Failed to fetch active employees: ${empError?.message || 'No active employees found'}`);
  }

  const testEmployee = employees[0];
  console.log(`Using test employee: ${testEmployee.full_name} (${testEmployee.id})\n`);

  // ----------------------------------------------------
  // TEST GROUP 1: Zod Schemas & Server-Side Validation
  // ----------------------------------------------------
  console.log('📋 Test Group 1: Server-Side Validation & Business Rules');

  // 1.1 Deal creation without service_id
  const validDealInput = {
    title: 'Nile Cruise Luxor to Aswan',
    customer_id: '11111111-1111-1111-1111-111111111111',
    assigned_to: testEmployee.id,
    stage: 'new',
    total_amount: '15000',
    notes: '2 adults, 1 child',
  };
  const parseDealNoService = createDealSchema.safeParse(validDealInput);
  assert(
    parseDealNoService.success,
    'Deal creation schema does NOT require service_id and accepts total_amount'
  );

  // 1.2 Deal stage 'lost' requires lost_reason
  const parseLostWithoutReason = changeDealStageSchema.safeParse({
    deal_id: '11111111-1111-1111-1111-111111111111',
    stage: 'lost',
    lost_reason: '',
  });
  assert(
    !parseLostWithoutReason.success,
    "Deal stage change to 'lost' strictly requires lost_reason"
  );

  // 1.3 Deal stage 'won' requires total_amount, paid_amount, payment_method
  const parseWonMissingFields = changeDealStageSchema.safeParse({
    deal_id: '11111111-1111-1111-1111-111111111111',
    stage: 'won',
  });
  assert(
    !parseWonMissingFields.success,
    "Deal stage change to 'won' requires financial fields (total_amount, paid_amount, payment_method)"
  );

  // 1.4 Deal stage 'won' rejects negative total_amount
  const parseWonNegativeTotal = changeDealStageSchema.safeParse({
    deal_id: '11111111-1111-1111-1111-111111111111',
    stage: 'won',
    total_amount: '-100',
    paid_amount: '0',
    payment_method: 'cash',
  });
  assert(
    !parseWonNegativeTotal.success,
    'Server validation rejects negative total_amount'
  );

  // 1.5 Deal stage 'won' rejects paid_amount > total_amount
  const parseWonOverpaid = changeDealStageSchema.safeParse({
    deal_id: '11111111-1111-1111-1111-111111111111',
    stage: 'won',
    total_amount: '5000',
    paid_amount: '6000',
    payment_method: 'cash',
  });
  assert(
    !parseWonOverpaid.success,
    'Server validation rejects paid_amount > total_amount'
  );

  // 1.6 Deal stage 'won' rejects invalid payment method
  const parseWonInvalidPaymentMethod = changeDealStageSchema.safeParse({
    deal_id: '11111111-1111-1111-1111-111111111111',
    stage: 'won',
    total_amount: '5000',
    paid_amount: '2000',
    payment_method: 'cryptocurrency',
  });
  assert(
    !parseWonInvalidPaymentMethod.success,
    'Server validation rejects unsupported payment method'
  );

  // 1.7 Deal stage 'won' valid financial input
  const parseWonValid = changeDealStageSchema.safeParse({
    deal_id: '11111111-1111-1111-1111-111111111111',
    stage: 'won',
    total_amount: '18500',
    paid_amount: '10000',
    payment_method: 'vodafone_cash',
  });
  assert(
    parseWonValid.success,
    "Valid 'won' financial input is accepted by schema"
  );

  // 1.8 Update deal payment validation
  const parsePaymentUpdate = updateDealPaymentSchema.safeParse({
    deal_id: '11111111-1111-1111-1111-111111111111',
    paid_amount: '18500',
    payment_method: 'instapay',
  });
  assert(
    parsePaymentUpdate.success,
    'updateDealPaymentSchema accepts valid paid_amount and payment_method'
  );

  // ----------------------------------------------------
  // TEST GROUP 2: Database Constraints & Integrity
  // ----------------------------------------------------
  console.log('\n🔒 Test Group 2: Database Constraints & Schema Invariants');

  // Create a temporary customer for database testing
  const uniqueSuffix = Date.now().toString().slice(-6);
  const testCustomerEmail = `traveler_${uniqueSuffix}@example.test`;
  const testCustomerPhone = `+20109${uniqueSuffix}`;

  const { data: customerA, error: custAError } = await admin
    .from('customers')
    .insert({
      full_name: `Tourism Customer ${uniqueSuffix}`,
      email: testCustomerEmail,
      phone: testCustomerPhone,
      source: 'website',
      created_by: testEmployee.id,
    })
    .select('*')
    .single();

  assert(
    !custAError && !!customerA,
    'Customer creation succeeded via admin client',
    custAError?.message
  );

  // 2.1 Soft Deduplication Warning Test:
  // Query existing customer by phone or email
  const { data: dupCheck } = await admin
    .from('customers')
    .select('id, full_name, email, phone')
    .or(`email.eq.${testCustomerEmail},phone.eq.${testCustomerPhone}`);

  assert(
    (dupCheck?.length ?? 0) > 0,
    'Customer duplicate detection finds existing matching customer'
  );

  // 2.2 Soft Deduplication Bypass Test:
  // Can still insert duplicate customer without silent overwrite or hard abort
  const { data: customerB, error: custBError } = await admin
    .from('customers')
    .insert({
      full_name: `Duplicate Phone Traveler ${uniqueSuffix}`,
      email: `other_${uniqueSuffix}@example.test`,
      phone: testCustomerPhone, // Same phone
      source: 'social_media',
      created_by: testEmployee.id,
    })
    .select('*')
    .single();

  assert(
    !custBError && !!customerB && customerB.id !== customerA?.id,
    'Soft deduplication allows creating duplicate customer when intended without overwriting'
  );

  // 2.3 DB Check Constraint Test: deals_paid_le_total
  // Try inserting deal directly where paid_amount > total_amount
  const { error: constraintError } = await admin
    .from('deals')
    .insert({
      title: 'Constraint Test Deal',
      customer_id: customerA.id,
      assigned_to: testEmployee.id,
      stage: 'won',
      total_amount: 1000,
      paid_amount: 1500, // VIOLATION
      created_by: testEmployee.id,
    });

  assert(
    !!constraintError && constraintError.message.includes('deals_paid_le_total'),
    'PostgreSQL deals_paid_le_total constraint rejects paid_amount > total_amount at DB level'
  );

  // ----------------------------------------------------
  // TEST GROUP 3: Tourism Deal Workflow & System Calculation
  // ----------------------------------------------------
  console.log('\n💼 Test Group 3: Deal Lifecycle, Atomic RPCs & Balance Calculations');

  // 3.1 Create deal without service catalog via crm_create_deal RPC
  const { data: newDealId, error: createRpcError } = await admin.rpc('crm_create_deal', {
    p_title: `Hurghada Safari Experience ${uniqueSuffix}`,
    p_customer_id: customerA.id,
    p_assigned_to: testEmployee.id,
    p_total_amount: 30000,
    p_expected_close_date: '2026-10-15',
    p_notes: 'Group of 4 looking for desert safari and quad biking',
    p_created_by: testEmployee.id,
  });

  assert(
    !createRpcError && !!newDealId,
    'crm_create_deal RPC creates deal without requiring service_id',
    createRpcError?.message
  );

  // Verify created deal
  const { data: createdDeal } = await admin
    .from('deals')
    .select('*')
    .eq('id', newDealId)
    .single();

  assert(
    createdDeal?.stage === 'new' && Number(createdDeal?.total_amount) === 30000 && createdDeal?.service_id === null,
    'Deal initialized in stage new with total_amount = 30000 and service_id = null'
  );

  // Verify activity was created atomically
  const { data: initialActivities } = await admin
    .from('deal_activities')
    .select('*')
    .eq('deal_id', newDealId);

  assert(
    Boolean(initialActivities?.some((a) => a.type === 'stage_change' || a.content.includes('Deal created'))),
    'Deal activity was atomically created for deal initialization'
  );

  // 3.2 Change stage to 'follow_up'
  const { error: followUpError } = await admin.rpc('crm_change_deal_stage', {
    p_deal_id: newDealId,
    p_new_stage: 'follow_up',
    p_actor_id: testEmployee.id,
    p_lost_reason: null,
    p_total_amount: null,
    p_paid_amount: null,
    p_payment_method: null,
  });

  assert(!followUpError, 'Stage change to follow_up succeeds', followUpError?.message);

  // 3.3 Mark as Won with Financial details
  // Total = 35000, Paid = 15000, Method = instapay
  const { error: wonError } = await admin.rpc('crm_change_deal_stage', {
    p_deal_id: newDealId,
    p_new_stage: 'won',
    p_actor_id: testEmployee.id,
    p_lost_reason: null,
    p_total_amount: 35000,
    p_paid_amount: 15000,
    p_payment_method: 'instapay',
  });

  assert(!wonError, 'Stage change to Won with payment succeeds via RPC', wonError?.message);

  // Verify DB state for Won deal
  const { data: wonDeal } = await admin
    .from('deals')
    .select('*')
    .eq('id', newDealId)
    .single();

  const total = Number(wonDeal?.total_amount);
  const paid = Number(wonDeal?.paid_amount);
  const remaining = Number(wonDeal?.remaining_amount);

  assert(
    wonDeal?.stage === 'won',
    'Deal stage is successfully won'
  );
  assert(
    total === 35000 && paid === 15000,
    'Total Amount (35000) and Paid Amount (15000) stored accurately'
  );
  assert(
    remaining === 20000 && remaining === total - paid,
    'Remaining Amount (20000) is accurately computed by the system: Total - Paid'
  );
  assert(
    wonDeal?.payment_method === 'instapay',
    'Payment Method is recorded as instapay'
  );

  // Verify financial activity logged
  const { data: wonActivities } = await admin
    .from('deal_activities')
    .select('*')
    .eq('deal_id', newDealId)
    .order('created_at', { ascending: false });

  assert(
    wonActivities?.[0]?.content.includes('Total: 35000') &&
      wonActivities?.[0]?.content.includes('Remaining: 20000'),
    'Financial activity breakdown is recorded in deal activity log'
  );

  // 3.4 Customer pays the remaining amount: Update payment
  // New paid amount = 35000 (settled in full)
  const { error: updatePayError } = await admin.rpc('crm_update_deal_payment', {
    p_deal_id: newDealId,
    p_actor_id: testEmployee.id,
    p_paid_amount: 35000,
    p_payment_method: 'bank_transfer',
  });

  assert(!updatePayError, 'Payment update on Won deal succeeds', updatePayError?.message);

  const { data: settledDeal } = await admin
    .from('deals')
    .select('*')
    .eq('id', newDealId)
    .single();

  const settledPaid = Number(settledDeal?.paid_amount);
  const settledRemaining = Number(settledDeal?.remaining_amount);

  assert(
    settledPaid === 35000 && settledRemaining === 0,
    'Subsequent payment fully settles deal: Paid = 35000, Remaining = 0'
  );
  assert(
    settledDeal?.payment_method === 'bank_transfer',
    'Payment Method updated to bank_transfer'
  );

  // ----------------------------------------------------
  // TEST GROUP 4: Security & Privilege Revocation
  // ----------------------------------------------------
  console.log('\n🛡️ Test Group 4: RPC Security & Role Isolation');

  // 4.1 Anon / Public caller cannot invoke atomic RPCs
  const { error: anonCreateError } = await anon.rpc('crm_create_deal', {
    p_title: 'Hacker Deal',
    p_customer_id: customerA.id,
    p_assigned_to: testEmployee.id,
    p_total_amount: 100,
    p_expected_close_date: null,
    p_notes: null,
    p_created_by: testEmployee.id,
  });

  assert(
    !!anonCreateError,
    'Anonymous client cannot call crm_create_deal RPC (permission denied)'
  );

  const { error: anonStageError } = await anon.rpc('crm_change_deal_stage', {
    p_deal_id: newDealId,
    p_new_stage: 'lost',
    p_actor_id: testEmployee.id,
    p_lost_reason: 'Unauthorized bypass test',
    p_total_amount: null,
    p_paid_amount: null,
    p_payment_method: null,
  });

  assert(
    !!anonStageError,
    'Anonymous client cannot call crm_change_deal_stage RPC (permission denied)'
  );

  const { error: anonPayError } = await anon.rpc('crm_update_deal_payment', {
    p_deal_id: newDealId,
    p_actor_id: testEmployee.id,
    p_paid_amount: 500,
    p_payment_method: 'cash',
  });

  assert(
    !!anonPayError,
    'Anonymous client cannot call crm_update_deal_payment RPC (permission denied)'
  );

  // 4.4 Sales Isolated Visibility & RLS Test
  const salesClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: salesAuth, error: salesLoginError } = await salesClient.auth.signInWithPassword({
    email: 'sales@elexir.test',
    password: 'Sales123!',
  });

  assert(
    !salesLoginError && !!salesAuth.user,
    'Sales user can authenticate successfully',
    salesLoginError?.message
  );

  if (salesAuth.user) {
    // Get sales employee id
    const { data: salesEmp } = await admin
      .from('employees')
      .select('id')
      .eq('auth_user_id', salesAuth.user.id)
      .single();

    // Create a private deal for Admin
    const { data: adminDeal, error: adminDealError } = await admin
      .from('deals')
      .insert({
        title: `Private Admin VIP Deal ${uniqueSuffix}`,
        customer_id: customerA.id,
        assigned_to: testEmployee.id, // Admin
        stage: 'proposal',
        total_amount: 50000,
        created_by: testEmployee.id,
      })
      .select('*')
      .single();

    assert(
      !adminDealError && !!adminDeal,
      'Admin private deal created for RLS isolation test'
    );

    // Create a deal for Sales user
    const { data: salesDeal, error: salesDealError } = await admin
      .from('deals')
      .insert({
        title: `Sales Owned Deal ${uniqueSuffix}`,
        customer_id: customerA.id,
        assigned_to: salesEmp!.id,
        stage: 'new',
        total_amount: 12000,
        created_by: salesEmp!.id,
      })
      .select('*')
      .single();

    assert(
      !salesDealError && !!salesDeal,
      'Sales-owned deal created for RLS isolation test'
    );

    // Sales user queries deals via RLS
    const { data: salesVisibleDeals } = await salesClient
      .from('deals')
      .select('id, title, assigned_to');

    const canSeeOwn = salesVisibleDeals?.some((d) => d.id === salesDeal?.id);
    const canSeeAdmin = salesVisibleDeals?.some((d) => d.id === adminDeal?.id);

    assert(
      canSeeOwn === true,
      'Sales employee can see their own assigned/created deal via RLS'
    );
    assert(
      canSeeAdmin === false,
      'Sales employee CANNOT see Admin private deal via RLS (isolated visibility enforced)'
    );

    // Sales user attempts to tamper with Admin's deal via RLS
    const { data: tamperedRows } = await salesClient
      .from('deals')
      .update({ notes: 'Hacked by Sales' })
      .eq('id', adminDeal!.id)
      .select();

    assert(
      (tamperedRows?.length ?? 0) === 0,
      'Sales employee CANNOT update Admin deal (0 rows modified by RLS update policy)'
    );

    // Clean up RLS test deals
    if (adminDeal) await admin.from('deals').delete().eq('id', adminDeal.id);
    if (salesDeal) await admin.from('deals').delete().eq('id', salesDeal.id);
  }

  // Clean up test data
  await admin.from('deal_activities').delete().eq('deal_id', newDealId);
  await admin.from('deals').delete().eq('id', newDealId);
  await admin.from('customers').delete().in('id', [customerA.id, customerB.id]);

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passedCount} passed, ${failedCount} failed`);
  console.log('====================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test execution error:', err);
  process.exit(1);
});
