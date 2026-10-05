// src/app/page.tsx
// Root page — redirects to dashboard (handled by middleware)
// This is a fallback in case middleware doesn't catch it.

import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/dashboard');
}
