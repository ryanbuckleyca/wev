import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizeNextPath } from '@/lib/auth/sanitize-next-path';
import { getSiteBaseUrlFromRequest } from '@/lib/site-url';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawCode = searchParams.get('code');
  const code = rawCode?.trim() ?? '';
  const rawTokenHash = searchParams.get('token_hash') ?? searchParams.get('token');
  const tokenHash = rawTokenHash?.trim() ?? '';
  const rawType = searchParams.get('type');
  const type = rawType?.trim() ?? '';
  // "next" param allows redirecting to a specific page after login
  const next = sanitizeNextPath(searchParams.get('next'));
  const base = getSiteBaseUrlFromRequest(request);

  if (code || (tokenHash && type)) {
    const supabase = await createClient();
    const result = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({
          type: type as never,
          token_hash: tokenHash,
        });

    const { error } = result;
    if (!error) {
      return NextResponse.redirect(`${base}${next}`);
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${base}/auth/auth-code-error`);
}
