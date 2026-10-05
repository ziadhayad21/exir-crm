// scripts/assign_admin.ts
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  const { data: emp, error: empErr } = await admin
    .from('employees')
    .select('id, email, full_name')
    .eq('email', 'ziad@elexir.test')
    .single();

  if (empErr || !emp) {
    console.error('Employee not found:', empErr?.message);
    return;
  }

  const adminRoleId = 'a0000000-0000-0000-0000-000000000001';

  // Delete existing roles and set Admin role
  await admin.from('user_roles').delete().eq('employee_id', emp.id);

  const { error: insErr } = await admin.from('user_roles').insert({
    employee_id: emp.id,
    role_id: adminRoleId,
  });

  if (insErr) {
    console.error('Failed to assign Admin role:', insErr.message);
  } else {
    console.log(`✅ Successfully assigned Admin role to ${emp.full_name} (${emp.email})`);
  }
}

run();
