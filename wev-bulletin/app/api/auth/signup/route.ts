import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import type { AuthError } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase-server';
import { getSiteBaseUrlFromRequest } from '@/lib/site-url';
import { isPasswordStrongEnough } from '@/lib/password-strength';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// `resend: true` re-sends the email for an account that already went through this
// route once (see CheckEmailCard). It carries no password because the check-email
// UI has none, so it always follows the existing-account path.
const SignupSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(8).max(200).optional(),
    captchaToken: z.string().min(1),
    resend: z.boolean().optional(),
  })
  .refine((body) => body.resend === true || typeof body.password === 'string', {
    path: ['password'],
    message: 'Password is required',
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
// Cap the map so a flood of unique emails can't grow it without bound. When full
// (after pruning expired entries) we fail closed and rate-limit the new key.
const RATE_LIMIT_MAX_KEYS = 10_000;

function pruneExpired(now: number): void {
  for (const [key, usage] of rateLimitMap) {
    if (now - usage.startTime > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(key);
    }
  }
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  let usage = rateLimitMap.get(key);
  if (usage && now - usage.startTime > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.delete(key);
    usage = undefined;
  }
  if (!usage) {
    if (rateLimitMap.size >= RATE_LIMIT_MAX_KEYS) {
      pruneExpired(now);
      if (rateLimitMap.size >= RATE_LIMIT_MAX_KEYS) {
        return true;
      }
    }
    usage = { count: 0, startTime: now };
    rateLimitMap.set(key, usage);
  }
  usage.count += 1;
  return usage.count > RATE_LIMIT_MAX;
}

/**
 * Send the existing-account email: a magic link (OTP) for a confirmed user, or a
 * signup confirmation resend for an account that was never confirmed.
 *
 * `captchaToken` is spent by `signInWithOtp`, so it is intentionally NOT passed to
 * the resend fallback — reusing a spent Turnstile token would fail. The fallback
 * is a rare edge (unconfirmed existing account) and fails closed if GoTrue rejects
 * it. Returns an AuthError on failure, or null on success.
 */
async function sendExistingAccountEmail(
  email: string,
  emailRedirectTo: string,
  captchaToken: string,
): Promise<AuthError | null> {
  const { error: otpError } = await supabaseServer.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo, captchaToken },
  });

  if (!otpError) return null;

  if (/confirm/i.test(otpError.message)) {
    const { error: resendError } = await supabaseServer.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo },
    });
    return resendError ?? null;
  }

  return otpError;
}

export async function POST(request: Request) {
  let email: string;
  let password: string | undefined;
  let captchaToken: string;
  let resend: boolean;
  try {
    const body = await request.json().catch(() => ({}));
    ({ email, password, captchaToken, resend = false } = SignupSchema.parse(body));
  } catch (error) {
    if (!(error instanceof ZodError)) {
      logger.error({ err: error }, 'Signup: failed to parse request');
    }
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }

  // Match the client strength floor so the server never accepts a password the form
  // would have rejected. Skipped for resend (no password is submitted).
  if (!resend && !isPasswordStrongEnough(password!)) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }

  // Normalize once and use everywhere (RPC + GoTrue) so lookup and send agree.
  const normalizedEmail = email.toLowerCase();

  if (isRateLimited(normalizedEmail)) {
    logger.warn({ email: normalizedEmail }, 'Signup rate limit exceeded');
    return NextResponse.json({ ok: false, error: 'rate_limit_exceeded' }, { status: 429 });
  }

  const emailRedirectTo = `${getSiteBaseUrlFromRequest(request)}/auth/callback`;

  // Timing note: the existing-account path (OTP) and the new-account path (bcrypt +
  // signUp) have different latencies, so response time can weakly hint at existence.
  // We accept this rather than adding brittle artificial sleeps; the identical
  // response body plus the shared pre-branch rate limit are the primary defenses.
  try {
    if (resend) {
      const error = await sendExistingAccountEmail(normalizedEmail, emailRedirectTo, captchaToken);
      if (error) {
        logger.error({ err: error }, 'Signup: resend failed');
        return NextResponse.json(FAILURE, { status: 500 });
      }
      return NextResponse.json(SUCCESS, { status: 200 });
    }

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
      const error = await sendExistingAccountEmail(normalizedEmail, emailRedirectTo, captchaToken);
      if (error) {
        logger.error({ err: error }, 'Signup: existing-account email failed');
        return NextResponse.json(FAILURE, { status: 500 });
      }
      return NextResponse.json(SUCCESS, { status: 200 });
    }

    // New account → normal signup confirmation email. Any signUp error (including a
    // rare "already registered" race) fails closed: retrying via the OTP path here
    // would require a second captcha we don't have, so we don't attempt recovery.
    const { error: signUpError } = await supabaseServer.auth.signUp({
      email: normalizedEmail,
      password: password!,
      options: { emailRedirectTo, captchaToken },
    });

    if (signUpError) {
      logger.error({ err: signUpError }, 'Signup: sign up failed');
      return NextResponse.json(FAILURE, { status: 500 });
    }

    return NextResponse.json(SUCCESS, { status: 200 });
  } catch (error) {
    logger.error({ err: error }, 'Signup route failed');
    return NextResponse.json(FAILURE, { status: 500 });
  }
}
