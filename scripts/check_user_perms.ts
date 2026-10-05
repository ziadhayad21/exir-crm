// scripts/check_user_perms.ts
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, serviceRoleKey);

async function check() {
  const { data: employees } = await admin.from('employees').select('id, full_name, email, auth_user_id');
  console.log('Employees in DB:', employees);

  for (const emp of employees || []) {
    const { data: userRoles } = await admin
      .from('user_roles')
      .select('role_id, roles(id, name)')
      .eq('employee_id', emp.id);

    console.log(`\nEmployee: ${emp.full_name} (${emp.email})`);
    console.log('User roles:', userRoles);

    const roleIds = (userRoles || []).map((ur: { role_id: string }) => ur.role_id);
    if (roleIds.length > 0) {
      const { data: rolePerms } = await admin
        .from('role_permissions')
        .select('permissions(key)')
        .in('role_id', roleIds);

      const keys = (rolePerms || [])
        .map((rp: { permissions: { key: string } | { key: string }[] | null }) => {
          if (!rp.permissions) return null;
          return Array.isArray(rp.permissions) ? rp.permissions[0]?.key : rp.permissions.key;
        })
        .filter((k): k is string => Boolean(k));

      console.log('Permission keys count:', keys.length);
      console.log('Has crm.customers.write?', keys.includes('crm.customers.write') || keys.includes('admin.system'));
      console.log('Has crm.customers.read_all?', keys.includes('crm.customers.read_all') || keys.includes('admin.system'));
      console.log('Has crm.customers.read_own?', keys.includes('crm.customers.read_own') || keys.includes('admin.system'));
    }
  }

  // Also check existing customers
  const { data: customers } = await admin.from('customers').select('id, full_name, phone, email, deleted_at');
  console.log('\nExisting customers in DB count:', customers?.length);
  console.log('Customers:', customers);
}

check();
