// src/app/auth/callback/route.ts
// Auth callback handler for Supabase email confirmations, OAuth, etc.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next');
  // Prevent open redirect: must start with /, cannot start with //, and cannot contain \ or @
  const safeNext =
    rawNext &&
    rawNext.startsWith('/') &&
    !rawNext.startsWith('//') &&
    !rawNext.includes('\\') &&
    !rawNext.includes('@')
      ? rawNext
      : '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(safeNext, origin));
    }
  }

  // Return to login on error
  return NextResponse.redirect(new URL('/login?error=auth_callback_failed', origin));
}
