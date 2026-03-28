import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSiteBaseUrlFromRequest } from '@/lib/site-url';

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const base = getSiteBaseUrlFromRequest(request);
  return NextResponse.redirect(`${base}/login`, { status: 302 });
}
