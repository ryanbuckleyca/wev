import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { LOCATION_MIN_QUERY_LENGTH } from '@/lib/location-config';

const MAX_RESULTS = 10;

/**
 * GET /api/locations/search?q=<query>
 *
 * Returns top 10 Canadian cities matching the prefix query.
 * The lat/lng values are city-centroid coordinates ready to store
 * directly on the profile — no additional geocoding needed at selection time.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') ?? '').trim();

    if (query.length < LOCATION_MIN_QUERY_LENGTH) {
      return NextResponse.json([], { status: 200 });
    }

    // Normalize query: lower case, decompose to NFD, and strip combining diacritical marks
    const normalizedQuery = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const { data, error } = await supabaseServer
      .from('cities')
      .select('name, province, display_name, lat, lng')
      .like('search_name', `${normalizedQuery}%`)
      .limit(MAX_RESULTS);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? [], {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to search locations';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
