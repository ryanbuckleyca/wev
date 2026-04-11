import { NextResponse } from 'next/server';

/** Simulated admin-gate failure for use with `requireAdminResponse` mocks. */
export function adminGateUnauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
