// src/lib/supabase/middleware.ts
// Supabase middleware helper for session refresh

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: Do NOT use supabase.auth.getSession() here.
  // getUser() sends a request to the Supabase Auth server to validate the token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Define public routes that don't require authentication
  const publicRoutes = ['/login', '/auth/callback', '/api/webhooks'];
  const isPublicRoute = publicRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route),
  );

  function createRedirect(pathname: string) {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const redirectResponse = NextResponse.redirect(url);
    // Copy any refreshed session cookies set by Supabase during getUser()
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  }

  if (!user && !isPublicRoute) {
    // Redirect to login if not authenticated and accessing protected route
    return createRedirect('/login');
  }

  if (user && request.nextUrl.pathname === '/login') {
    // Redirect to dashboard if already authenticated and visiting login
    return createRedirect('/dashboard');
  }

  // Redirect root to dashboard for authenticated users
  if (user && request.nextUrl.pathname === '/') {
    return createRedirect('/dashboard');
  }

  return supabaseResponse;
}
