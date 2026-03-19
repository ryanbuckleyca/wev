import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// Cache the entire list for 24 hours at the Edge
export const revalidate = 86400

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const locale = searchParams.get('locale') || 'en'
    
    const supabase = getSupabaseServer()

    let allData: any[] = []
    let from = 0
    const pageSize = 1000

    while (true) {
      const { data, error } = await supabase
        .from('esco_skills')
        .select('concept_uri, preferred_label_en, preferred_label_fr, alternative_label_en, alternative_label_fr, skill_type, reuse_level')
        .order('preferred_label_en', { ascending: true })
        .range(from, from + pageSize - 1)

      if (error) throw error
      if (!data || data.length === 0) break
      
      allData = [...allData, ...data]
      if (data.length < pageSize) break
      from += pageSize
    }

    // Map to a compact format for the client
    const skills = allData.map(r => ({
      uri: r.concept_uri,
      term: locale === 'fr' ? (r.preferred_label_fr || r.preferred_label_en) : (r.preferred_label_en || r.preferred_label_fr),
      aliases: locale === 'fr' 
        ? [...(r.alternative_label_fr || []), ...(r.alternative_label_en || [])]
        : [...(r.alternative_label_en || []), ...(r.alternative_label_fr || [])],
      type: r.skill_type,
      level: r.reuse_level
    }))

    return NextResponse.json(
      { skills },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
        },
      }
    )
  } catch (err) {
    console.error('Fetch all skills error:', err)
    return NextResponse.json({ error: 'Failed to fetch skills' }, { status: 500 })
  }
}
