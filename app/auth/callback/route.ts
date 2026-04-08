import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizeNextPath } from '@/lib/auth/sanitize-next-path';
import { getSiteBaseUrlFromRequest } from '@/lib/site-url';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawCode = searchParams.get('code');
  const code = rawCode?.trim() ?? '';
  // "next" param allows redirecting to a specific page after login
  const next = sanitizeNextPath(searchParams.get('next'));
  const base = getSiteBaseUrlFromRequest(request);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${base}${next}`);
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${base}/auth/auth-code-error`);
}
