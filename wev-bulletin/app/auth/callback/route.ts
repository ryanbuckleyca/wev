import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizeNextPath } from '@/lib/auth/sanitize-next-path';
import { getSiteBaseUrlFromRequest } from '@/lib/site-url';
import { logger } from '@/lib/logger';

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

    // Special handling for PKCE errors - likely email change confirmations
    // Email change confirmations fail PKCE verification due to Supabase SSR limitations
    // but the user should already have a valid session
    if (error?.code === 'pkce_code_verifier_not_found' && code) {
      // Check if user already has a valid session (indicates email change, not signup)
      // Use getUser() to validate against server, not just local storage
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        logger.info(
          {
            code: error.code,
            hasUser: true,
          },
          'PKCE code verifier not found but user is authenticated - email change may have been applied by Supabase',
        );

        // User is already authenticated
        // The email change should have been applied by Supabase when they clicked the link
        // Redirect to home
        return NextResponse.redirect(`${base}${next}`);
      }
    }

    if (!error) {
      return NextResponse.redirect(`${base}${next}`);
    }

    // Log other errors for debugging
    logger.warn(
      {
        error: error.message,
        code: error.code,
        status: error.status,
        type,
        hasCode: !!code,
        hasTokenHash: !!tokenHash,
      },
      'Auth callback error',
    );
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${base}/auth/auth-code-error`);
}
