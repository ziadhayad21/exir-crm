// scripts/seed_20_leads.ts
// Adds 20 realistic Lead records with authentic Egyptian travel and CRM customer interactions.
// Demonstrates all statuses (won, follow_up, in_progress, lose), realistic financials,
// assignment to eligible sales reps (or unassigned queue), and customer linking (One Customer -> Many Leads).

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface SeedLeadDef {
  full_name: string;
  phone: string;
  email: string;
  source: 'whatsapp' | 'phone_call' | 'website' | 'social_media' | 'referral' | 'walk_in' | 'manual';
  status: 'won' | 'follow_up' | 'in_progress' | 'lose';
  follow_up_offset_hours?: number; // relative to now
  service_name?: string;
  total_amount?: number;
  paid_amount?: number;
  remaining_amount?: number;
  lost_reason?: string;
  notes: string;
  create_customer?: boolean;
  link_to_customer_phone?: string; // for returning customer multi-leads
}

const LEADS_DATA: SeedLeadDef[] = [
  // 1. Won - Rixos Sharm (with Customer creation)
  {
    full_name: 'Ahmed Mansour',
    phone: '+201001234567',
    email: 'ahmed.mansour@gmail.com',
    source: 'whatsapp',
    status: 'won',
    service_name: 'Sharm El-Sheikh Rixos Seagate 5D/4N (Ultra All-Inclusive)',
    total_amount: 38000,
    paid_amount: 38000,
    remaining_amount: 0,
    notes: 'Family of 4, booked 2 deluxe sea-view rooms. Full payment settled via Bank Transfer.',
    create_customer: true,
  },

  // 2. Returning Lead for Ahmed Mansour (Follow Up - One Customer -> Many Leads)
  {
    full_name: 'Ahmed Mansour',
    phone: '+201001234567',
    email: 'ahmed.mansour@gmail.com',
    source: 'whatsapp',
    status: 'follow_up',
    follow_up_offset_hours: 24, // tomorrow
    notes: 'Returning Customer: Inquiring about New Year Istanbul & Cappadocia trip for 6 adults. Follow up with Turkish Airlines flight schedule.',
    link_to_customer_phone: '+201001234567',
  },

  // 3. Follow Up - Umrah package (with Customer creation)
  {
    full_name: 'Mohamed El-Sayed',
    phone: '+201112345678',
    email: 'm.elsayed88@outlook.com',
    source: 'phone_call',
    status: 'follow_up',
    follow_up_offset_hours: 8, // today evening
    notes: 'Inquiring for Umrah package during Rajab. Requested 5-star hotel near Haram (Makkah Clock Tower). Follow up with visa requirements and passport copies.',
    create_customer: true,
  },

  // 4. In Progress - Hurghada Honeymoon
  {
    full_name: 'Nour Abdel-Rahman',
    phone: '+201223456789',
    email: 'nour.abdelrahman@yahoo.com',
    source: 'website',
    status: 'in_progress',
    notes: 'Submitted website inquiry for Hurghada Steigenberger ALDAU Beach 4D/3N honeymoon package. Sent 3 customized room options via WhatsApp.',
  },

  // 5. Won - Nile Cruise VIP (with Customer creation)
  {
    full_name: 'Mahmoud Hassan',
    phone: '+201023456789',
    email: 'mahmoud.hassan@techcorp-eg.com',
    source: 'referral',
    status: 'won',
    service_name: 'VIP Nile Cruise Luxor to Aswan 4 Nights (MS Mayfair)',
    total_amount: 46000,
    paid_amount: 25000,
    remaining_amount: 21000,
    notes: 'Corporate executive retreat booking for 2 upper-deck suites. 25,000 EGP deposit received, balance due at embarkation.',
    create_customer: true,
  },

  // 6. Follow Up - Dubai Shopping Festival
  {
    full_name: 'Fatima Al-Zahraa Ali',
    phone: '+201551234567',
    email: 'fatima.elzahraa@hotmail.com',
    source: 'social_media',
    status: 'follow_up',
    follow_up_offset_hours: 48, // in 2 days
    notes: 'Instagram DM lead: Inquiring about Dubai Shopping Festival package with Emirates flights and Downtown hotel. Sent quotation, follow up on Friday.',
  },

  // 7. In Progress - European Schengen Tour
  {
    full_name: 'Omar Farouk',
    phone: '+201067890123',
    email: 'omar.farouk@e-commerce.eg',
    source: 'walk_in',
    status: 'in_progress',
    notes: 'Walked into Dokki branch asking for Schengen Visa assistance and itinerary for Spain & Italy tech summit in November.',
  },

  // 8. Lose - El Gouna (found cheaper)
  {
    full_name: 'Karim Sherif',
    phone: '+201145678901',
    email: 'karim.sherif@gmail.com',
    source: 'whatsapp',
    status: 'lose',
    service_name: 'El Gouna 3 Nights Weekend Break (The Chedi)',
    lost_reason: 'Found cheaper direct room rates on hotel loyalty application',
    notes: 'Client wanted specific marina view suite; our supplier rate had a 12% price difference.',
  },

  // 9. Won - Dahab Eco-Lodge (with Customer creation)
  {
    full_name: 'Radwa Ezzat',
    phone: '+201289012345',
    email: 'radwa.ezzat@gmail.com',
    source: 'social_media',
    status: 'won',
    service_name: 'Dahab & Nuweiba Eco-Lodge Relaxation Package 4D/3N',
    total_amount: 17500,
    paid_amount: 17500,
    remaining_amount: 0,
    notes: 'Private SUV transportation from Cairo + Coral Coast Hotel. Full payment settled via InstaPay.',
    create_customer: true,
  },

  // 10. In Progress - Marsa Alam Diving Safari
  {
    full_name: 'Tarek Nabil',
    phone: '+201019876543',
    email: 'tarek.nabil@construction-eg.com',
    source: 'phone_call',
    status: 'in_progress',
    notes: 'Group trip inquiry for 10 certified divers: Marsa Alam diving safari & boat trips. Preparing customized group package.',
  },

  // 11. Follow Up - Beirut City Tour
  {
    full_name: 'Salma Khaled',
    phone: '+201123459876',
    email: 'salma.khaled@outlook.com',
    source: 'website',
    status: 'follow_up',
    follow_up_offset_hours: 72, // in 3 days
    notes: 'Website form: Beirut 5-day tour with day trips to Jeita Grotto & Byblos. Client waiting for spouse vacation approval; follow up Monday.',
  },

  // 12. Won - Deluxe Umrah 5-Star (with Customer creation)
  {
    full_name: 'Amr Diab Fahmy',
    phone: '+201201239876',
    email: 'amr.fahmy@diabconsulting.com',
    source: 'referral',
    status: 'won',
    service_name: 'Deluxe Umrah Package (Dar Al Tawhid Intercontinental 7 Days)',
    total_amount: 82000,
    paid_amount: 50000,
    remaining_amount: 32000,
    notes: 'VIP Umrah package for 2 persons, direct flights EgyptAir. Deposit paid via CIB transfer, remaining balance scheduled next week.',
    create_customer: true,
  },

  // 13. In Progress - Siwa Oasis Eco Retreat
  {
    full_name: 'Reem Gamal',
    phone: '+201509876543',
    email: 'reem.gamal@designstudio.eg',
    source: 'whatsapp',
    status: 'in_progress',
    notes: 'WhatsApp inquiry: Siwa Oasis 3D/2N eco retreat for 3 friends during mid-year vacation. Sent hotel options (Adrère Amellal and Shali Lodge).',
  },

  // 14. Lose - UK Tour (Visa appointment delays)
  {
    full_name: 'Khaled Fouad',
    phone: '+201098761234',
    email: 'k.fouad@pharma.eg',
    source: 'phone_call',
    status: 'lose',
    service_name: 'London & Edinburgh 8 Days Tour',
    lost_reason: 'UK Visa appointment delays exceeded desired travel window',
    notes: 'Client postponed trip to summer 2027 due to TLScontact visa appointment backlog.',
  },

  // 15. Follow Up - Aswan Old Cataract Winter Sun
  {
    full_name: 'Menna Shalaby Ibrahim',
    phone: '+201198765432',
    email: 'menna.shalaby@artgallery.com',
    source: 'social_media',
    status: 'follow_up',
    follow_up_offset_hours: 6, // today after work
    notes: 'Facebook Lead Ad: Aswan Winter Sun package at Sofitel Legend Old Cataract. Wants Nile-view luxury room. Client requested call after 6:00 PM.',
  },

  // 16. In Progress - Munich Business & Leisure
  {
    full_name: 'Youssef Mostafa',
    phone: '+201276543210',
    email: 'youssef.mostafa@fintech.eg',
    source: 'manual',
    status: 'in_progress',
    notes: 'Direct entry by sales rep: Client requested flight ticket issuance for Cairo - Munich - Cairo (Lufthansa) + 4 nights hotel in Munich City Centre.',
  },

  // 17. Won - Turkey Group Tour (with Customer creation)
  {
    full_name: 'Dina Samir',
    phone: '+201034567812',
    email: 'dina.samir@education.eg',
    source: 'whatsapp',
    status: 'won',
    service_name: 'Istanbul & Cappadocia 7 Days Group Tour with Balloon Ride',
    total_amount: 54000,
    paid_amount: 54000,
    remaining_amount: 0,
    notes: 'Cappadocia hot air balloon flight and Bosphorus dinner cruise included. Full payment settled via Visa credit card.',
    create_customer: true,
  },

  // 18. Follow Up - Red Sea Yacht Charter
  {
    full_name: 'Hesham Abbas Kamel',
    phone: '+201187654321',
    email: 'hesham.abbas@lawfirm.eg',
    source: 'referral',
    status: 'follow_up',
    follow_up_offset_hours: 30, // tomorrow afternoon
    notes: 'Referred by Dr. Tarek. Looking for private yacht day charter in Hurghada (Orange Bay) for family celebration. Preparing vessel availability.',
  },

  // 19. In Progress - Georgia Tbilisi Family Stay
  {
    full_name: 'Mona Zaki Abdallah',
    phone: '+201298765431',
    email: 'mona.zaki@lifestyle.eg',
    source: 'walk_in',
    status: 'in_progress',
    notes: 'Visited Heliopolis branch: Inquired about family visa-free package to Georgia (Tbilisi & Kazbegi) for 6 days. Shared itinerary options.',
  },

  // 20. Lose - Central Europe (Date conflict)
  {
    full_name: 'Sherif Mounir Othman',
    phone: '+201045678923',
    email: 'sherif.mounir@trading.eg',
    source: 'phone_call',
    status: 'lose',
    service_name: 'Vienna & Prague Central Europe 7 Days Tour',
    lost_reason: 'Travel dates conflicted with unexpected business board meeting',
    notes: 'Client had to cancel vacation plans due to urgent corporate commitments; requested follow up for Easter holidays.',
  },
];

async function seed() {
  console.log('====================================================');
  console.log('🌟 SEEDING 20 REALISTIC CRM LEADS');
  console.log('====================================================\n');

  // 1. Fetch any creator employee for Customer records
  const { data: creatorEmployees } = await admin
    .from('employees')
    .select('id, full_name, is_active')
    .eq('is_active', true)
    .limit(1);

  const creatorEmployeeId = creatorEmployees?.[0]?.id || '1e11c1da-792a-4f53-bb7e-c896bc4370cf';

  // 2. Fetch eligible sales employees for lead assignment
  const { data: eligibleSales } = await admin.rpc('get_eligible_sales_employees');
  const hasSalesEmployees = Array.isArray(eligibleSales) && eligibleSales.length > 0;

  if (hasSalesEmployees) {
    console.log(`Found ${eligibleSales.length} eligible sales employees for assignment:`);
    eligibleSales.forEach((emp: { id: string; full_name: string }) => console.log(`  - ${emp.full_name} (${emp.id})`));
  } else {
    console.log('ℹ️ No sales-role-only employees found; assigning leads as unassigned (assigned_to: null, assignment_source: unassigned).');
  }
  console.log('');

  // Map of phone -> customer_id created in this session
  const customerIdMap = new Map<string, string>();

  // Check if any of these phones already exist in customers
  const allPhones = LEADS_DATA.map((l) => l.phone);
  const { data: existingCustomers } = await admin
    .from('customers')
    .select('id, full_name, phone')
    .in('phone', allPhones)
    .is('deleted_at', null);

  for (const ec of existingCustomers || []) {
    if (ec.phone) customerIdMap.set(ec.phone, ec.id);
  }

  let leadsInserted = 0;
  let customersCreated = 0;

  for (let i = 0; i < LEADS_DATA.length; i++) {
    const item = LEADS_DATA[i];

    let linkedCustomerId: string | null = null;

    // Step A: Create Customer record if requested
    if (item.create_customer) {
      if (customerIdMap.has(item.phone)) {
        linkedCustomerId = customerIdMap.get(item.phone)!;
      } else {
        const { data: newCust, error: custErr } = await admin
          .from('customers')
          .insert({
            full_name: item.full_name,
            phone: item.phone,
            email: item.email,
            source: item.source,
            notes: `Customer profile for ${item.full_name}. Inquired about ${item.service_name || 'travel packages'}.`,
            created_by: creatorEmployeeId,
          })
          .select('id')
          .single();

        if (custErr) {
          console.warn(`  ⚠️ Could not create customer for ${item.full_name}:`, custErr.message);
        } else if (newCust) {
          linkedCustomerId = newCust.id;
          customerIdMap.set(item.phone, newCust.id);
          customersCreated++;
          console.log(`  👤 Created Customer profile: ${item.full_name} (${item.phone}) -> ID: ${newCust.id.slice(0, 8)}...`);
        }
      }
    } else if (item.link_to_customer_phone && customerIdMap.has(item.link_to_customer_phone)) {
      // Returning customer multi-lead link
      linkedCustomerId = customerIdMap.get(item.link_to_customer_phone)!;
      console.log(`  🔗 Linking returning lead to existing customer: ${item.full_name} -> Customer ID: ${linkedCustomerId.slice(0, 8)}...`);
    }

    // Step B: Calculate follow-up timestamp if status is follow_up
    let followUpAt: string | null = null;
    if (item.status === 'follow_up') {
      const offsetMs = (item.follow_up_offset_hours ?? 24) * 60 * 60 * 1000;
      followUpAt = new Date(Date.now() + offsetMs).toISOString();
    }

    // Step C: Determine assignment fields respecting database triggers
    let assignedTo: string | null = null;
    let assignedAt: string | null = null;
    let assignmentSource: 'automatic' | 'unassigned' = 'unassigned';

    if (hasSalesEmployees) {
      const assignedEmp = eligibleSales[i % eligibleSales.length];
      assignedTo = assignedEmp.id;
      assignedAt = new Date().toISOString();
      assignmentSource = 'automatic';
    }

    // Step D: Prepare Lead record adhering to all constraints
    const leadPayload: Record<string, unknown> = {
      full_name: item.full_name,
      phone: item.phone,
      email: item.email,
      source: item.source,
      status: item.status,
      notes: item.notes,
      assigned_to: assignedTo,
      assigned_at: assignedAt,
      assignment_source: assignmentSource,
      customer_id: linkedCustomerId,
      converted_to_customer_id: item.create_customer ? linkedCustomerId : null,
      follow_up_at: followUpAt,
    };

    if (item.service_name) {
      leadPayload.service_name = item.service_name;
    }
    if (item.total_amount !== undefined) {
      leadPayload.total_amount = item.total_amount;
    }
    if (item.paid_amount !== undefined) {
      leadPayload.paid_amount = item.paid_amount;
    }
    if (item.remaining_amount !== undefined) {
      leadPayload.remaining_amount = item.remaining_amount;
    }
    if (item.lost_reason) {
      leadPayload.lost_reason = item.lost_reason;
    }

    const { data: insertedLead, error: insertErr } = await admin
      .from('leads')
      .insert(leadPayload)
      .select('id, full_name, status, service_name, customer_id')
      .single();

    if (insertErr) {
      console.error(`  ❌ Failed to insert lead for ${item.full_name}:`, insertErr.message);
    } else if (insertedLead) {
      leadsInserted++;
      const statusBadge = `[${insertedLead.status.toUpperCase()}]`;
      const custInfo = insertedLead.customer_id ? `(Linked to Customer)` : '';
      console.log(`  ✅ [${leadsInserted}/20] Inserted Lead: ${insertedLead.full_name} ${statusBadge} ${custInfo}`);
    }
  }

  console.log('\n====================================================');
  console.log(`🎉 SEED COMPLETE: Successfully added ${leadsInserted} Leads and ${customersCreated} Customer profiles!`);
  console.log('====================================================');
}

seed().catch((err) => {
  console.error('Fatal error during seeding:', err);
  process.exit(1);
});
