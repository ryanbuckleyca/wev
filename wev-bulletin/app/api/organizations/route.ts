import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { fetchOrganizationIndex } from '@/lib/organizations/server-data';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const supabaseAuth = await createServerClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  const page = parseInt(searchParams.get('page') || '1', 10);
  const q = searchParams.get('q') || '';
  const sse = searchParams.get('sse') === 'true';
  const requestedSortBy = searchParams.get('sortBy') || (user ? 'value-match-desc' : 'org-asc');
  const sortBy = user || !requestedSortBy.includes('match') ? requestedSortBy : 'org-asc';

  const provinces = searchParams.getAll('provs');
  const municipalities = searchParams.getAll('munis');
  const types = searchParams.getAll('types');

  try {
    const result = await fetchOrganizationIndex(
      page,
      q,
      sse,
      provinces,
      municipalities,
      types,
      user?.id ?? null,
      sortBy,
    );

    return NextResponse.json({
      orgs: result.orgs,
      total: result.total,
      totalAvailable: result.totalAvailable,
    });
  } catch (error) {
    console.error('organizations api unhandled error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
