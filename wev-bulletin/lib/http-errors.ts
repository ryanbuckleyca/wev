import { NextResponse } from 'next/server';

/** Standard JSON error body shape for API routes (`{ error: string }`). */
export type ApiErrorBody = { error: string };

export function unauthorizedResponse(message = 'Unauthorized'): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbiddenResponse(message = 'Forbidden'): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: message }, { status: 403 });
}
