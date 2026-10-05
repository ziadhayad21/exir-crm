// src/app/login/actions.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { loginSchema } from '@/lib/validations/auth';
import { writeAuditLog } from '@/lib/audit';
import type { ActionResult } from '@/types';

export async function loginAction(formData: FormData): Promise<ActionResult> {
  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),
  };

  // Validate input
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      success: false,
      error: 'Invalid email or password',
    };
  }

  // Check if employee record exists and is active
  if (data.user) {
    const { data: employee } = await supabase
      .from('employees')
      .select('id, is_active')
      .eq('auth_user_id', data.user.id)
      .single();

    if (!employee) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'No employee record found for this account. Contact an administrator.',
      };
    }

    if (!employee.is_active) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Your account has been deactivated. Contact an administrator.',
      };
    }

    // Audit log
    await writeAuditLog({
      actor_id: employee.id,
      action: 'auth.login',
      module: 'auth',
      metadata: { email: parsed.data.email },
    });
  }

  return { success: true };
}
