import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { supabaseServer } from '@/lib/supabase-server';
import { getSiteBaseUrlFromRequest } from '@/lib/site-url';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const SignupSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(6).max(200),
  captchaToken: z.string().min(1),
});

// Identical success payload for both the existing-account and new-account paths.
// The client must not be able to tell whether the email is already registered.
const SUCCESS = { ok: true } as const;
const FAILURE = { ok: false, error: 'signup_failed' } as const;

// In-memory throttle (per isolate), mirroring app/api/cv/extract. Keyed by the
// normalized email and applied BEFORE the existence branch, so it behaves the same
// for existing and new accounts and can't be used to enumerate. GoTrue also
// enforces captcha plus per-IP / per-email rate limits (supabase/config.toml).
const rateLimitMap = new Map<string, { count: number; startTime: number }>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function isRateLimited(key: string): boolean {
  const now = Date.now();
  let usage = rateLimitMap.get(key);
  if (usage && now - usage.startTime > RATE_LIMIT_WINDOW_MS) {
    usage = undefined;
  }
  if (!usage) {
    usage = { count: 0, startTime: now };
    rateLimitMap.set(key, usage);
  }
  usage.count += 1;
  return usage.count > RATE_LIMIT_MAX;
}

export async function POST(request: Request) {
  let email: string;
  let password: string;
  let captchaToken: string;
  try {
    const body = await request.json().catch(() => ({}));
    ({ email, password, captchaToken } = SignupSchema.parse(body));
  } catch (error) {
    if (!(error instanceof ZodError)) {
      logger.error({ err: error }, 'Signup: failed to parse request');
    }
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase();

  if (isRateLimited(normalizedEmail)) {
    logger.warn({ email: normalizedEmail }, 'Signup rate limit exceeded');
    return NextResponse.json({ ok: false, error: 'rate_limit_exceeded' }, { status: 429 });
  }

  const emailRedirectTo = `${getSiteBaseUrlFromRequest(request)}/auth/callback`;

  try {
    const { data, error: lookupError } = await supabaseServer.rpc('get_auth_user_id_by_email', {
      input_email: normalizedEmail,
    });

    if (lookupError) {
      // Fail closed: never claim success when we can't determine the branch.
      logger.error({ err: lookupError }, 'Signup: auth user lookup failed');
      return NextResponse.json(FAILURE, { status: 500 });
    }

    const existingUserId = (data as string | null) ?? null;

    if (existingUserId) {
      // Existing account → send a magic link instead of a silent "already registered".
      const { error: otpError } = await supabaseServer.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo, captchaToken },
      });

      if (otpError) {
        // Edge case: the account exists but was never confirmed. GoTrue won't
        // OTP-login an unconfirmed user, so resend the signup confirmation instead.
        if (/confirm/i.test(otpError.message)) {
          const { error: resendError } = await supabaseServer.auth.resend({
            type: 'signup',
            email,
            options: { emailRedirectTo },
          });
          if (resendError) {
            logger.error({ err: resendError }, 'Signup: resend confirmation failed');
            return NextResponse.json(FAILURE, { status: 500 });
          }
          return NextResponse.json(SUCCESS, { status: 200 });
        }
        // Fail closed: mail send failed, don't report success.
        logger.error({ err: otpError }, 'Signup: magic link send failed');
        return NextResponse.json(FAILURE, { status: 500 });
      }

      return NextResponse.json(SUCCESS, { status: 200 });
    }

    // New account → normal signup confirmation email.
    const { error: signUpError } = await supabaseServer.auth.signUp({
      email,
      password,
      options: { emailRedirectTo, captchaToken },
    });

    if (signUpError) {
      // Race: another request created the account between lookup and signUp.
      // Fall through to the existing-account path so we still send mail.
      if (/already registered|already been registered/i.test(signUpError.message)) {
        const { error: otpError } = await supabaseServer.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false, emailRedirectTo, captchaToken },
        });
        if (otpError) {
          if (/confirm/i.test(otpError.message)) {
            const { error: resendError } = await supabaseServer.auth.resend({
              type: 'signup',
              email,
              options: { emailRedirectTo },
            });
            if (resendError) {
              logger.error({ err: resendError }, 'Signup: race resend confirmation failed');
              return NextResponse.json(FAILURE, { status: 500 });
            }
            return NextResponse.json(SUCCESS, { status: 200 });
          }
          logger.error({ err: otpError }, 'Signup: race magic link send failed');
          return NextResponse.json(FAILURE, { status: 500 });
        }
        return NextResponse.json(SUCCESS, { status: 200 });
      }
      logger.error({ err: signUpError }, 'Signup: sign up failed');
      return NextResponse.json(FAILURE, { status: 500 });
    }

    return NextResponse.json(SUCCESS, { status: 200 });
  } catch (error) {
    logger.error({ err: error }, 'Signup route failed');
    return NextResponse.json(FAILURE, { status: 500 });
  }
}
