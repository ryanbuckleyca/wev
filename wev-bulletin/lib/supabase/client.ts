'use client';

import { createBrowserClient } from '@supabase/ssr';
import { resolveBrowserSupabaseUrl } from '@/lib/supabase/browser-url';

export function createClient() {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const pageHref = typeof window !== 'undefined' ? window.location.href : null;
  const url = resolveBrowserSupabaseUrl(configured, pageHref);

  return createBrowserClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
