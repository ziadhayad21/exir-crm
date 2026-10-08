// scripts/wipe_all_except_admin.ts
// Complete System Reset Script:
// 1. Clears ALL operational data (Inbox, Messages, Conversations, Webhook Events,
//    Leads, Deals, Customers, Notifications, Deal Activities, Audit Logs).
// 2. Removes ALL non-admin staff employee accounts and Supabase Auth users.
// 3. Preserves ONLY the Admin account(s), master roles, permissions, and services catalogue.

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ADMIN_ROLE_ID = 'a0000000-0000-0000-0000-000000000001';

// Known admin emails to preserve
const PROTECTED_ADMIN_EMAILS = [
  'admin@elexir.test',
  'ziad@elexir.test',
  'admin@exir.com',
];

async function wipeAllExceptAdmin() {
  console.log('====================================================');
  console.log('🗑️  El-Exir ERP: Complete Reset (Keep Admin Only)');
  console.log('====================================================\n');

  // Dummy UUID to bypass Supabase filter requirement on blanket deletes
  const DUMMY_UUID = '00000000-0000-0000-0000-000000000000';

  // 1. Wipe Operational Tables in FK order (child tables first)
  const operationalTables = [
    'notifications',
    'lead_status_history',
    'message_attachments',
    'messages',
    'conversations',
    'channel_identities',
    'webhook_events',
    'deal_activities',
    'deals',
    'leads',
    'customers',
  ];

  console.log('📦 Step 1: Wiping Operational CRM & Inbox Data...');
  for (const table of operationalTables) {
    const { error } = await adminClient.from(table).delete().neq('id', DUMMY_UUID);
    if (error) {
      console.warn(`   ⚠️ Warning clearing ${table}:`, error.message);
    } else {
      console.log(`   ✅ Table '${table}' cleared.`);
    }
  }

  // Clear Audit Logs table
  const { error: auditErr } = await adminClient.from('audit_logs').delete().neq('id', DUMMY_UUID);
  if (auditErr) {
    console.warn('   ⚠️ Warning clearing audit_logs:', auditErr.message);
  } else {
    console.log("   ✅ Table 'audit_logs' cleared.");
  }
  console.log('   ✅ All operational data wiped successfully.\n');

  // 2. Identify Admin employee(s) vs Non-admin employees
  console.log('👤 Step 2: Processing Staff Accounts...');
  const { data: employees, error: empErr } = await adminClient
    .from('employees')
    .select('id, full_name, email, auth_user_id, is_active');

  if (empErr || !employees) {
    console.error('❌ Failed to fetch employees:', empErr?.message);
    process.exit(1);
  }

  const { data: userRoles } = await adminClient
    .from('user_roles')
    .select('employee_id, role_id');

  const adminEmpIds = new Set<string>();
  for (const ur of userRoles || []) {
    if (ur.role_id === ADMIN_ROLE_ID) {
      adminEmpIds.add(ur.employee_id);
    }
  }

  const adminEmployees = employees.filter((emp) => {
    const email = emp.email.toLowerCase();
    return PROTECTED_ADMIN_EMAILS.includes(email) || adminEmpIds.has(emp.id);
  });

  if (adminEmployees.length === 0) {
    console.error('❌ No matching Admin account found! Aborting to avoid locking out the system.');
    process.exit(1);
  }

  const primaryAdmin =
    adminEmployees.find((e) => e.email.toLowerCase() === 'admin@elexir.test') ||
    adminEmployees[0];

  console.log(`🛡️  Preserving ${adminEmployees.length} Admin account(s):`);
  for (const a of adminEmployees) {
    console.log(`   • ${a.full_name} (${a.email}) [ID: ${a.id}]`);
  }

  const nonAdminEmployees = employees.filter(
    (emp) => !adminEmployees.some((a) => a.id === emp.id)
  );

  console.log(`\n🎯 Identified ${nonAdminEmployees.length} non-admin employee account(s) to delete.`);

  if (nonAdminEmployees.length > 0) {
    const nonAdminIds = nonAdminEmployees.map((e) => e.id);

    // Delete user_roles for non-admin employees
    console.log('🗑️  Deleting non-admin user_roles...');
    const { error: delRolesErr } = await adminClient
      .from('user_roles')
      .delete()
      .in('employee_id', nonAdminIds);
    if (delRolesErr) {
      console.warn('   ⚠️ user_roles delete:', delRolesErr.message);
    } else {
      console.log('   ✅ Non-admin user_roles deleted.');
    }

    // Delete employee rows for non-admin employees
    console.log('🗑️  Deleting non-admin employee records...');
    const { error: delEmpErr } = await adminClient
      .from('employees')
      .delete()
      .in('id', nonAdminIds);
    if (delEmpErr) {
      console.error('   ❌ Failed to delete employees:', delEmpErr.message);
    } else {
      console.log(`   ✅ ${nonAdminEmployees.length} employee record(s) deleted.`);
    }
  }

  // 3. Delete non-admin auth users from Supabase Auth
  console.log('\n🔐 Step 3: Cleaning Supabase Auth Users...');
  const { data: authList, error: authListErr } = await adminClient.auth.admin.listUsers();
  if (authListErr) {
    console.error('❌ Failed to list auth users:', authListErr.message);
  } else {
    const protectedAuthIds = new Set(
      adminEmployees.map((a) => a.auth_user_id).filter(Boolean)
    );
    const protectedEmails = new Set(
      adminEmployees.map((a) => a.email.toLowerCase())
    );

    let deletedAuthCount = 0;
    for (const u of authList.users || []) {
      const email = (u.email || '').toLowerCase();
      const isProtected = protectedAuthIds.has(u.id) || protectedEmails.has(email);

      if (!isProtected) {
        const { error: delErr } = await adminClient.auth.admin.deleteUser(u.id);
        if (delErr) {
          console.warn(`   ⚠️ Could not delete auth user ${email} (${u.id}):`, delErr.message);
        } else {
          deletedAuthCount++;
          console.log(`   🗑️ Deleted auth user: ${email} (${u.id})`);
        }
      }
    }
    console.log(`   ✅ Total auth users deleted: ${deletedAuthCount}`);
  }

  // 4. Verify & Ensure Admin account consistency
  console.log('\n🔒 Step 4: Ensuring Admin Account Consistency...');
  for (const a of adminEmployees) {
    // Ensure Admin role in user_roles
    const { data: existingRole } = await adminClient
      .from('user_roles')
      .select('id')
      .eq('employee_id', a.id)
      .eq('role_id', ADMIN_ROLE_ID)
      .maybeSingle();

    if (!existingRole) {
      await adminClient.from('user_roles').insert({
        employee_id: a.id,
        role_id: ADMIN_ROLE_ID,
      });
      console.log(`   ✅ Granted Admin role to ${a.email}`);
    } else {
      console.log(`   ✅ Admin role active for ${a.email}`);
    }

    // Reset status: active & offline
    await adminClient
      .from('employees')
      .update({ is_active: true, is_online: false })
      .eq('id', a.id);

    // Confirm password for Admin account (Admin123!)
    if (a.auth_user_id) {
      const { error: pwErr } = await adminClient.auth.admin.updateUserById(a.auth_user_id, {
        password: 'Admin123!',
        email_confirm: true,
      });
      if (pwErr) {
        console.warn(`   ⚠️ Could not update password for ${a.email}:`, pwErr.message);
      } else {
        console.log(`   🔑 Admin account active: ${a.email} | Password: Admin123!`);
      }
    }
  }

  console.log('\n====================================================');
  console.log('🎉 Complete System Reset Successful!');
  console.log('====================================================');
  console.log('All operational data and non-admin staff accounts wiped.');
  console.log(`Preserved Admin: ${primaryAdmin.full_name} (${primaryAdmin.email})`);
  console.log('Admin Password: Admin123!');
  console.log('====================================================\n');
}

wipeAllExceptAdmin().catch((err) => {
  console.error('❌ Fatal error during system wipe:', err);
  process.exit(1);
});
