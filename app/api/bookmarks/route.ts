import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: Request) {
  try {
    const supabase = getSupabaseServer()

    // Get current user from Supabase auth if available in cookie
    const cookie = req.headers.get('cookie') || ''
    // Use server client with service role to query bookmarks for the current authenticated user.
    // Prefer checking auth header via supabase auth helpers if available; fall back to RLS via service key.

    // We'll attempt to read the authenticated user's id from the Supabase session cookie
    // If not present, return unauthorized.
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    const userId = sessionData?.data?.session?.user?.id

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Join bookmarks -> jobs and return job fields plus bookmark metadata
    const { data, error } = await supabase
      .from('jobs')
      .select(`id, job_title, organization, location, municipality, province, work_type, date_posted, close_date, wage, listing_url, employment_type, summary, is_sse, source_id, sources(name), values, bookmarks!inner(user_id, created_at)`)
      .in('id', supabase.from('bookmarks').select('job_id').eq('user_id', userId))
      .order('date_posted', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Normalize jobs result similar to /api/bulletin
    const jobsWithSource = (data ?? []).map((job: any) => {
      const sources = (job as { sources?: { name?: string } | { name?: string }[] }).sources
      const sourceName = Array.isArray(sources) ? sources[0]?.name : sources?.name
      const { sources: _sources, source_id: _sourceId, bookmarks: _bookmarks, ...rest } = job as {
        sources?: { name?: string } | { name?: string }[]
        source_id?: string
        bookmarks?: any
        [key: string]: unknown
      }
      return {
        ...rest,
        source: sourceName ?? null,
      }
    })

    return NextResponse.json({ jobs: jobsWithSource })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch bookmarked jobs'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
