// scripts/verify_customer_lead_linking.ts
// Comprehensive verification test suite for Customer <-> Lead Bidirectional Linking with Searchable Selection

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import {
  createCustomerSchema,
  createLeadSchema,
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
  console.log('🚀 CUSTOMER <-> LEAD LINKING VERIFICATION SUITE');
  console.log('====================================================\n');

  // Track created IDs for cleanup
  const createdCustomerIds: string[] = [];
  const createdLeadIds: string[] = [];

  try {
    // ----------------------------------------------------
    // TEST GROUP 1: Schema Validations
    // ----------------------------------------------------
    console.log('--- TEST GROUP 1: Zod Schemas ---');

    const validCustWithLead = createCustomerSchema.safeParse({
      full_name: 'Ahmed Zaki',
      phone: '+201011112222',
      email: 'ahmed@example.com',
      source: 'manual',
      lead_id: '11111111-1111-1111-1111-111111111111',
    });
    assert(validCustWithLead.success, 'createCustomerSchema accepts lead_id');
    if (validCustWithLead.success) {
      assert(validCustWithLead.data.lead_id === '11111111-1111-1111-1111-111111111111', 'lead_id properly parsed in createCustomer');
    }

    const validLeadWithCust = createLeadSchema.safeParse({
      full_name: 'Ahmed Zaki',
      phone: '+201011112222',
      customer_id: '22222222-2222-2222-2222-222222222222',
      create_new_customer: false,
    });
    assert(validLeadWithCust.success, 'createLeadSchema accepts customer_id');
    if (validLeadWithCust.success) {
      assert(validLeadWithCust.data.customer_id === '22222222-2222-2222-2222-222222222222', 'customer_id properly parsed in createLead');
    }

    const validLeadWithCreateCust = createLeadSchema.safeParse({
      full_name: 'Sara Omar',
      phone: '+201033334444',
      create_new_customer: true,
    });
    assert(validLeadWithCreateCust.success, 'createLeadSchema accepts create_new_customer flag');
    if (validLeadWithCreateCust.success) {
      assert(validLeadWithCreateCust.data.create_new_customer === true, 'create_new_customer parsed as boolean true');
    }

    // ----------------------------------------------------
    // TEST GROUP 2: Setup Test Employee
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 2: Test Environment Context ---');
    const { data: employees, error: empErr } = await admin
      .from('employees')
      .select('id, full_name, is_active')
      .eq('is_active', true)
      .limit(1);

    if (empErr || !employees || employees.length === 0) {
      throw new Error(`Failed to find active employee for testing: ${empErr?.message}`);
    }
    const testEmployee = employees[0];
    console.log(`Using active employee: ${testEmployee.full_name} (${testEmployee.id})`);

    // ----------------------------------------------------
    // TEST GROUP 3: Create Customer -> Select Existing Lead
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 3: Create Customer -> Select Existing Lead ---');

    // Step 3a: Create an incoming Lead
    const testPhone1 = `+20109999${Math.floor(1000 + Math.random() * 9000)}`;
    const { data: lead1, error: lead1Err } = await admin
      .from('leads')
      .insert({
        full_name: 'Tariq Test Linked',
        phone: testPhone1,
        email: 'tariq.test@example.com',
        source: 'whatsapp',
        status: 'in_progress',
        notes: 'Inbound message from WhatsApp',
      })
      .select('*')
      .single();

    assert(!lead1Err && !!lead1, 'Lead 1 inserted successfully', lead1Err?.message);
    if (lead1) createdLeadIds.push(lead1.id);

    // Step 3b: Create Customer and link to Lead 1 (simulating createCustomer with lead_id)
    const { data: customer1, error: cust1Err } = await admin
      .from('customers')
      .insert({
        full_name: lead1.full_name,
        phone: lead1.phone,
        email: lead1.email,
        source: lead1.source,
        notes: 'Converted from lead',
        created_by: testEmployee.id,
      })
      .select('*')
      .single();

    assert(!cust1Err && !!customer1, 'Customer 1 created successfully', cust1Err?.message);
    if (customer1) createdCustomerIds.push(customer1.id);

    // Simulate the lead linking in createCustomer action:
    const { error: linkErr } = await admin
      .from('leads')
      .update({
        customer_id: customer1.id,
        converted_to_customer_id: customer1.id,
      })
      .eq('id', lead1.id);

    assert(!linkErr, 'Lead 1 linked to Customer 1', linkErr?.message);

    // Verify lead 1 now references customer 1
    const { data: verifiedLead1 } = await admin
      .from('leads')
      .select('*')
      .eq('id', lead1.id)
      .single();

    assert(verifiedLead1?.customer_id === customer1.id, 'verifiedLead1.customer_id equals customer1.id');
    assert(verifiedLead1?.converted_to_customer_id === customer1.id, 'verifiedLead1.converted_to_customer_id equals customer1.id');

    // Verify no duplicate lead was created
    const { count: leadCountForCust1 } = await admin
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', customer1.id);

    assert(leadCountForCust1 === 1, 'Exactly 1 lead exists for Customer 1 after conversion');

    // ----------------------------------------------------
    // TEST GROUP 4: Returning Customer -> Create New Lead (One Customer -> Many Leads)
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 4: One Customer -> Many Leads (Returning Customer) ---');

    // Step 4a: Returning customer inquires again. Create Lead 2 linked to Customer 1!
    const { data: lead2, error: lead2Err } = await admin
      .from('leads')
      .insert({
        full_name: customer1.full_name,
        phone: customer1.phone,
        email: customer1.email,
        source: 'phone_call',
        status: 'follow_up',
        follow_up_at: new Date(Date.now() + 86400000).toISOString(),
        notes: 'Lead 2: Customer returning for second vacation package',
        customer_id: customer1.id,
      })
      .select('*')
      .single();

    assert(!lead2Err && !!lead2, 'Lead 2 (returning customer) created successfully', lead2Err?.message);
    if (lead2) createdLeadIds.push(lead2.id);
    assert(lead2?.customer_id === customer1.id, 'Lead 2 correctly linked to existing Customer 1');

    // Step 4b: Returning customer inquires for a 3rd opportunity. Create Lead 3 linked to Customer 1!
    const { data: lead3, error: lead3Err } = await admin
      .from('leads')
      .insert({
        full_name: customer1.full_name,
        phone: customer1.phone,
        email: customer1.email,
        source: 'walk_in',
        status: 'won',
        service_name: 'VIP Nile Cruise Suite',
        total_amount: 35000,
        paid_amount: 35000,
        remaining_amount: 0,
        notes: 'Lead 3: Won purchase for Nile Cruise',
        customer_id: customer1.id,
      })
      .select('*')
      .single();

    assert(!lead3Err && !!lead3, 'Lead 3 (won interaction) created successfully', lead3Err?.message);
    if (lead3) createdLeadIds.push(lead3.id);
    assert(lead3?.customer_id === customer1.id, 'Lead 3 correctly linked to existing Customer 1');

    // Step 4c: Verify NO duplicate customer records were created!
    const { data: matchingCustomers, count: custCount } = await admin
      .from('customers')
      .select('*', { count: 'exact' })
      .eq('phone', testPhone1)
      .is('deleted_at', null);

    assert(custCount === 1, 'No duplicate customer records created for phone ' + testPhone1);
    assert(matchingCustomers?.[0]?.id === customer1.id, 'Single customer record ID matches customer1.id');

    // Step 4d: Verify Customer 1 now has 3 distinct leads (One Customer -> Many Leads)
    const { data: cust1Leads, count: cust1LeadsCount } = await admin
      .from('leads')
      .select('*', { count: 'exact' })
      .or(`customer_id.eq.${customer1.id},converted_to_customer_id.eq.${customer1.id}`)
      .order('created_at', { ascending: false });

    assert(cust1LeadsCount === 3, `Customer 1 has exactly 3 leads (found ${cust1LeadsCount})`);
    assert(Boolean(cust1Leads?.some((l) => l.id === lead1.id)), 'Customer leads list includes Lead 1');
    assert(Boolean(cust1Leads?.some((l) => l.id === lead2.id)), 'Customer leads list includes Lead 2');
    assert(Boolean(cust1Leads?.some((l) => l.id === lead3.id)), 'Customer leads list includes Lead 3');

    // ----------------------------------------------------
    // TEST GROUP 5: Create Lead with + Create New Customer
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 5: Create Lead with + Create New Customer ---');

    const testPhone2 = `+20108888${Math.floor(1000 + Math.random() * 9000)}`;

    // Simulate createLead action with create_new_customer = true:
    // 1. Check deduplication
    const { data: existingCheck } = await admin
      .from('customers')
      .select('id')
      .is('deleted_at', null)
      .eq('phone', testPhone2);

    assert((existingCheck?.length ?? 0) === 0, 'No existing customer before creation');

    // 2. Create customer
    const { data: customer2, error: cust2Err } = await admin
      .from('customers')
      .insert({
        full_name: 'Nadia New On The Fly',
        phone: testPhone2,
        email: 'nadia@example.com',
        source: 'social_media',
        notes: 'Created on the fly from Lead modal',
        created_by: testEmployee.id,
      })
      .select('*')
      .single();

    assert(!cust2Err && !!customer2, 'Customer 2 created on the fly', cust2Err?.message);
    if (customer2) createdCustomerIds.push(customer2.id);

    // 3. Create lead linked to newly created customer
    const { data: lead4, error: lead4Err } = await admin
      .from('leads')
      .insert({
        full_name: customer2.full_name,
        phone: customer2.phone,
        email: customer2.email,
        source: 'social_media',
        status: 'in_progress',
        notes: 'Lead created with on-the-fly customer',
        customer_id: customer2.id,
      })
      .select('*')
      .single();

    assert(!lead4Err && !!lead4, 'Lead 4 created and linked to Customer 2', lead4Err?.message);
    if (lead4) createdLeadIds.push(lead4.id);
    assert(lead4?.customer_id === customer2.id, 'Lead 4 customer_id points to Customer 2');

    // 4. Test deduplication: if createLead called again with create_new_customer = true and same phone,
    // it finds existing customer and DOES NOT create a duplicate customer
    const { data: dedupCheck } = await admin
      .from('customers')
      .select('id')
      .is('deleted_at', null)
      .eq('phone', testPhone2);

    assert(dedupCheck?.length === 1, 'Deduplication check finds existing customer');
    const existingId = dedupCheck?.[0]?.id;

    // Create 2nd lead for Nadia using existing customer id:
    const { data: lead5, error: lead5Err } = await admin
      .from('leads')
      .insert({
        full_name: 'Nadia New On The Fly',
        phone: testPhone2,
        email: 'nadia@example.com',
        source: 'website',
        status: 'in_progress',
        notes: 'Second lead for Nadia',
        customer_id: existingId,
      })
      .select('*')
      .single();

    assert(!lead5Err && !!lead5, 'Lead 5 created and linked to existing Customer 2 without duplication');
    if (lead5) createdLeadIds.push(lead5.id);

    const { count: nadiaCustCount } = await admin
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('phone', testPhone2)
      .is('deleted_at', null);

    assert(nadiaCustCount === 1, 'Only 1 customer record exists for Nadia after multiple leads');

    // ----------------------------------------------------
    // TEST GROUP 6: Lead Status Workflow & Sales Isolation
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 6: Lead Status & Workflow on Linked Leads ---');

    // Verify updating lead status to 'won' maintains customer_id
    const { data: updatedLead2, error: updErr } = await admin
      .from('leads')
      .update({
        status: 'won',
        follow_up_at: null,
        service_name: 'Hurghada Resort 4 Nights',
        total_amount: 18000,
        paid_amount: 10000,
        remaining_amount: 8000,
      })
      .eq('id', lead2.id)
      .select('*')
      .single();

    assert(!updErr && !!updatedLead2, 'Lead 2 updated to won with financial details', updErr?.message);
    assert(updatedLead2?.status === 'won', 'Lead 2 status is won');
    assert(updatedLead2?.customer_id === customer1.id, 'Lead 2 customer_id preserved after status change');
    assert(Number(updatedLead2?.total_amount) === 18000, 'Lead 2 total_amount is 18000');
    assert(Number(updatedLead2?.remaining_amount) === 8000, 'Lead 2 remaining_amount is 8000');

    // Verify updating lead status to 'lose' maintains customer_id
    const { data: updatedLead1, error: loseErr } = await admin
      .from('leads')
      .update({
        status: 'lose',
        lost_reason: 'Budget constraints',
      })
      .eq('id', lead1.id)
      .select('*')
      .single();

    assert(!loseErr && !!updatedLead1, 'Lead 1 updated to lose with lost_reason', loseErr?.message);
    assert(updatedLead1?.status === 'lose', 'Lead 1 status is lose');
    assert(updatedLead1?.lost_reason === 'Budget constraints', 'Lead 1 lost_reason recorded');
    assert(updatedLead1?.customer_id === customer1.id, 'Lead 1 customer_id preserved after status change');

  } finally {
    // ----------------------------------------------------
    // CLEANUP
    // ----------------------------------------------------
    console.log('\n--- CLEANUP ---');
    if (createdLeadIds.length > 0) {
      const { error: delLeadsErr } = await admin
        .from('leads')
        .delete()
        .in('id', createdLeadIds);
      if (delLeadsErr) {
        console.warn('⚠️ Warning cleaning up test leads:', delLeadsErr.message);
      } else {
        console.log(`Cleaned up ${createdLeadIds.length} test leads.`);
      }
    }

    if (createdCustomerIds.length > 0) {
      const { error: delCustErr } = await admin
        .from('customers')
        .delete()
        .in('id', createdCustomerIds);
      if (delCustErr) {
        console.warn('⚠️ Warning cleaning up test customers:', delCustErr.message);
      } else {
        console.log(`Cleaned up ${createdCustomerIds.length} test customers.`);
      }
    }
  }

  console.log('\n====================================================');
  console.log(`VERIFICATION COMPLETE: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('====================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running verification test:', err);
  process.exit(1);
});
