// src/app/(dashboard)/actions.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentEmployee } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { redirect } from 'next/navigation';

export async function logoutAction() {
  const employee = await getCurrentEmployee();
  const supabase = await createClient();

  if (employee) {
    // Phase 3: Set employee offline on logout so they stop receiving new leads
    const admin = createAdminClient();
    await admin
      .from('employees')
      .update({ is_online: false, last_heartbeat: null })
      .eq('id', employee.id);

    await writeAuditLog({
      actor_id: employee.id,
      action: 'auth.logout',
      module: 'auth',
    });
  }

  await supabase.auth.signOut();
  redirect('/login');
}

