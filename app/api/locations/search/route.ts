import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 10;

type CityRow = {
  name: string;
  province: string;
  display_name: string;
  lat: number;
  lng: number;
};

/**
 * GET /api/locations/search?q=<query>
 *
 * Returns top 10 Canadian cities matching the prefix query.
 * The lat/lng values are city-centroid coordinates ready to store
 * directly on the profile — no additional Geocodio call needed at
 * selection time.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') ?? '').trim();

    if (query.length < MIN_QUERY_LENGTH) {
      return NextResponse.json([], { status: 200 });
    }

    const supabase = getSupabaseServer();

    const { data, error } = await supabase
      .from('cities')
      .select('name, province, display_name, lat, lng')
      .ilike('display_name', `${query}%`)
      .limit(MAX_RESULTS);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results: CityRow[] = (data ?? []).map((row) => ({
      name: row.name,
      province: row.province,
      display_name: row.display_name,
      lat: row.lat,
      lng: row.lng,
    }));

    return NextResponse.json(results, {
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
