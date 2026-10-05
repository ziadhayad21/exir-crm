// scripts/seed.ts
// Development seed script — creates test users via Supabase Admin API.
//
// Usage:
//   npx tsx scripts/seed.ts
//
// Prerequisites:
//   1. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
//   2. Run all migrations first
//   3. Run this script to create test users
//
// Test Users:
//   admin@elexir.test    / Admin123!     → Admin role
//   sales@elexir.test    / Sales123!     → Sales role
//   finance@elexir.test  / Finance123!   → Accountant role
//   hr@elexir.test       / Hr12345!      → HR role

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Role IDs from the seed migration
const ROLE_IDS = {
  Admin: 'a0000000-0000-0000-0000-000000000001',
  Sales: 'a0000000-0000-0000-0000-000000000002',
  Accountant: 'a0000000-0000-0000-0000-000000000003',
  HR: 'a0000000-0000-0000-0000-000000000004',
} as const;

interface TestUser {
  email: string;
  password: string;
  full_name: string;
  phone: string | null;
  role: keyof typeof ROLE_IDS;
}

const TEST_USERS: TestUser[] = [
  {
    email: 'admin@elexir.test',
    password: 'Admin123!',
    full_name: 'Admin User',
    phone: '+20 100 000 0001',
    role: 'Admin',
  },
  {
    email: 'sales@elexir.test',
    password: 'Sales123!',
    full_name: 'Sales Agent',
    phone: '+20 100 000 0002',
    role: 'Sales',
  },
  {
    email: 'finance@elexir.test',
    password: 'Finance123!',
    full_name: 'Finance Manager',
    phone: '+20 100 000 0003',
    role: 'Accountant',
  },
  {
    email: 'hr@elexir.test',
    password: 'Hr12345!',
    full_name: 'HR Manager',
    phone: '+20 100 000 0004',
    role: 'HR',
  },
];

async function seedUser(user: TestUser) {
  console.log(`\n📝 Creating user: ${user.email} (${user.role})`);

  // 1. Create auth user
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
  });

  if (authError) {
    if (authError.message.includes('already been registered')) {
      console.log(`   ⚠️  User ${user.email} already exists, fetching...`);
      // Try to find existing user
      const { data: users } = await admin.auth.admin.listUsers();
      const existing = users?.users?.find((u) => u.email === user.email);
      if (!existing) {
        console.error(`   ❌ Could not find existing user: ${user.email}`);
        return;
      }
      // Check if employee record exists
      const { data: existingEmp } = await admin
        .from('employees')
        .select('id')
        .eq('auth_user_id', existing.id)
        .single();

      if (existingEmp) {
        console.log(`   ✅ Employee record already exists.`);
        return;
      }

      // Create employee record for existing auth user
      await createEmployeeAndRole(existing.id, user);
      return;
    }

    console.error(`   ❌ Auth error: ${authError.message}`);
    return;
  }

  if (!authData.user) {
    console.error(`   ❌ No user returned from auth.admin.createUser`);
    return;
  }

  console.log(`   ✅ Auth user created: ${authData.user.id}`);

  await createEmployeeAndRole(authData.user.id, user);
}

async function createEmployeeAndRole(authUserId: string, user: TestUser) {
  // 2. Create employee record
  const { data: employee, error: empError } = await admin
    .from('employees')
    .insert({
      auth_user_id: authUserId,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      is_active: true,
    })
    .select()
    .single();

  if (empError) {
    console.error(`   ❌ Employee creation error: ${empError.message}`);
    return;
  }

  console.log(`   ✅ Employee created: ${employee.id}`);

  // 3. Assign role
  const roleId = ROLE_IDS[user.role];
  const { error: roleError } = await admin
    .from('user_roles')
    .insert({
      employee_id: employee.id,
      role_id: roleId,
    });

  if (roleError) {
    console.error(`   ❌ Role assignment error: ${roleError.message}`);
    return;
  }

  console.log(`   ✅ Role assigned: ${user.role}`);
}

async function main() {
  console.log('🌱 Seeding El-Exir ERP test data...');
  console.log(`   URL: ${supabaseUrl}`);
  console.log('');

  for (const user of TEST_USERS) {
    await seedUser(user);
  }

  console.log('\n✅ Seed complete!');
  console.log('\n📋 Test credentials:');
  console.log('┌─────────────────────────┬─────────────┬────────────┐');
  console.log('│ Email                   │ Password    │ Role       │');
  console.log('├─────────────────────────┼─────────────┼────────────┤');
  for (const user of TEST_USERS) {
    console.log(
      `│ ${user.email.padEnd(23)} │ ${user.password.padEnd(11)} │ ${user.role.padEnd(10)} │`,
    );
  }
  console.log('└─────────────────────────┴─────────────┴────────────┘');
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
