// scripts/seed_clean_accounts.ts
// Cleans all employee and auth accounts EXCEPT for the Admin account(s).
//
// Usage:
//   npx tsx scripts/seed_clean_accounts.ts
//
// What it does:
// 1. Identifies the designated Admin account(s).
// 2. Reassigns any dependent records (deals, customers, activities) to Admin to satisfy FK constraints.
// 3. Deletes user_roles and employee records for all non-admin accounts.
// 4. Deletes auth users from Supabase Auth for all non-admin accounts.
// 5. Ensures the main Admin account remains active, confirmed, and has the Admin role.

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

// Known admin emails to always preserve
const PROTECTED_ADMIN_EMAILS = [
  'admin@elexir.test',
  'ziad@elexir.test',
];

async function main() {
  console.log('====================================================');
  console.log('🧹 El-Exir ERP: Seed Clean Accounts (Keep Admin Only)');
  console.log('====================================================\n');

  // 1. Fetch all employees and their roles
  const { data: employees, error: empErr } = await adminClient
    .from('employees')
    .select('id, full_name, email, auth_user_id, is_active');

  if (empErr || !employees) {
    console.error('❌ Failed to fetch employees:', empErr?.message);
    process.exit(1);
  }

  const { data: userRoles, error: roleErr } = await adminClient
    .from('user_roles')
    .select('employee_id, role_id, roles(id, name)');

  if (roleErr) {
    console.error('❌ Failed to fetch user_roles:', roleErr.message);
    process.exit(1);
  }

  // Build a map of employee -> roles
  const empRoleNames = new Map<string, string[]>();
  for (const ur of userRoles || []) {
    const list = empRoleNames.get(ur.employee_id) || [];
    const roleRecord = Array.isArray(ur.roles) ? ur.roles[0] : ur.roles;
    const roleName =
      roleRecord && typeof roleRecord === 'object' && 'name' in roleRecord
        ? String((roleRecord as { name?: unknown }).name)
        : undefined;
    if (roleName) list.push(roleName);
    empRoleNames.set(ur.employee_id, list);
  }

  // Optional CLI argument for a specific admin email, e.g.: npx tsx scripts/seed_clean_accounts.ts admin@elexir.test
  const customTargetEmail = process.argv[2]?.trim().toLowerCase();

  // 2. Identify Admin employee(s) vs Non-admin employees
  const adminEmployees = employees.filter((emp) => {
    const email = emp.email.toLowerCase();
    if (customTargetEmail) {
      return email === customTargetEmail;
    }
    return PROTECTED_ADMIN_EMAILS.includes(email);
  });

  if (adminEmployees.length === 0) {
    console.error('❌ No matching Admin account found! Aborting to avoid locking out the system.');
    console.error(`   Searched for: ${customTargetEmail || PROTECTED_ADMIN_EMAILS.join(', ')}`);
    process.exit(1);
  }

  // Pick the primary Admin to reassign any required foreign keys to
  const primaryAdmin =
    adminEmployees.find((e) => e.email.toLowerCase() === 'admin@elexir.test') ||
    adminEmployees[0];

  console.log(`🛡️  Preserving ${adminEmployees.length} Admin account(s):`);
  for (const a of adminEmployees) {
    console.log(`   • ${a.full_name} (${a.email}) [ID: ${a.id}]`);
  }
  console.log(`   (Primary fallback Admin for reassignments: ${primaryAdmin.email})\n`);

  const nonAdminEmployees = employees.filter(
    (emp) => !adminEmployees.some((a) => a.id === emp.id)
  );

  console.log(`🎯 Identified ${nonAdminEmployees.length} non-admin employee account(s) to remove.\n`);

  if (nonAdminEmployees.length === 0) {
    console.log('✅ No non-admin accounts to remove. Checking auth users for orphans...');
  } else {
    const nonAdminIds = nonAdminEmployees.map((e) => e.id);

    // 3. Handle Foreign Key dependencies safely
    console.log('🔄 Reassigning foreign key dependencies to primary Admin...');

    // Deals created_by
    const { error: dealsCreateErr } = await adminClient
      .from('deals')
      .update({ created_by: primaryAdmin.id })
      .in('created_by', nonAdminIds);
    if (dealsCreateErr) console.warn('   ⚠️ deals.created_by update:', dealsCreateErr.message);

    // Deals assigned_to
    const { error: dealsAssignErr } = await adminClient
      .from('deals')
      .update({ assigned_to: primaryAdmin.id })
      .in('assigned_to', nonAdminIds);
    if (dealsAssignErr) console.warn('   ⚠️ deals.assigned_to update:', dealsAssignErr.message);

    // Customers created_by
    const { error: custErr } = await adminClient
      .from('customers')
      .update({ created_by: primaryAdmin.id })
      .in('created_by', nonAdminIds);
    if (custErr) console.warn('   ⚠️ customers.created_by update:', custErr.message);

    // Deal activities actor_id
    const { error: actErr } = await adminClient
      .from('deal_activities')
      .update({ actor_id: primaryAdmin.id })
      .in('actor_id', nonAdminIds);
    if (actErr) console.warn('   ⚠️ deal_activities.actor_id update:', actErr.message);

    // Leads assigned_to (set to null)
    const { error: leadErr } = await adminClient
      .from('leads')
      .update({ assigned_to: null })
      .in('assigned_to', nonAdminIds);
    if (leadErr) console.warn('   ⚠️ leads.assigned_to update:', leadErr.message);

    // Conversations assigned_to (set to null)
    const { error: convErr } = await adminClient
      .from('conversations')
      .update({ assigned_to: null })
      .in('assigned_to', nonAdminIds);
    if (convErr) console.warn('   ⚠️ conversations.assigned_to update:', convErr.message);

    // Messages sender_employee_id (set to null)
    const { error: msgErr } = await adminClient
      .from('messages')
      .update({ sender_employee_id: null })
      .in('sender_employee_id', nonAdminIds);
    if (msgErr) console.warn('   ⚠️ messages.sender_employee_id update:', msgErr.message);

    // Audit logs actor_id (set to null)
    const { error: auditErr } = await adminClient
      .from('audit_logs')
      .update({ actor_id: null })
      .in('actor_id', nonAdminIds);
    if (auditErr) console.warn('   ⚠️ audit_logs.actor_id update:', auditErr.message);

    console.log('   ✅ Foreign key references resolved.\n');

    // 4. Delete user_roles for non-admin employees
    console.log('🗑️  Deleting non-admin user_roles...');
    const { error: delRolesErr } = await adminClient
      .from('user_roles')
      .delete()
      .in('employee_id', nonAdminIds);
    if (delRolesErr) {
      console.warn('   ⚠️ user_roles delete:', delRolesErr.message);
    } else {
      console.log('   ✅ user_roles removed.');
    }

    // 5. Delete employee rows for non-admin employees
    console.log('🗑️  Deleting non-admin employees...');
    const { error: delEmpErr } = await adminClient
      .from('employees')
      .delete()
      .in('id', nonAdminIds);
    if (delEmpErr) {
      console.error('   ❌ Failed to delete employees:', delEmpErr.message);
      process.exit(1);
    } else {
      console.log(`   ✅ ${nonAdminEmployees.length} employee record(s) deleted.`);
    }
  }

  // 6. Delete non-admin auth users from Supabase Auth
  console.log('\n🗑️  Cleaning Supabase Auth users...');
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

  // 7. Verify & ensure primary Admin has Admin role in user_roles
  console.log('\n🔒 Ensuring Admin role consistency...');
  for (const a of adminEmployees) {
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
      console.log(`   ✅ Verified Admin role for ${a.email}`);
    }

    // Ensure employee is active
    await adminClient
      .from('employees')
      .update({ is_active: true })
      .eq('id', a.id);

    // Ensure Auth user password is confirmed and set to Admin123!
    if (a.auth_user_id) {
      const { error: pwErr } = await adminClient.auth.admin.updateUserById(a.auth_user_id, {
        password: 'Admin123!',
        email_confirm: true,
      });
      if (pwErr) {
        console.warn(`   ⚠️ Could not set password for ${a.email}:`, pwErr.message);
      } else {
        console.log(`   🔑 Guaranteed Admin password for ${a.email}: Admin123!`);
      }
    }
  }

  console.log('\n====================================================');
  console.log('🎉 Cleanup Completed Successfully!');
  console.log('====================================================');
  console.log('All non-admin accounts have been wiped.');
  for (const a of adminEmployees) {
    console.log(`Preserved Admin: ${a.full_name} (${a.email}) | Password: Admin123!`);
  }
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('❌ Fatal error during cleanup:', err);
  process.exit(1);
});
