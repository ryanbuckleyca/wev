import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const MAX_URIS = 200

function parseUris(value: string | null): string[] {
  if (!value) {
    return []
  }
  const seen = new Set<string>()
  const result: string[] = []
  for (const part of value.split(',')) {
    const uri = part.trim()
    if (!uri || seen.has(uri)) {
      continue
    }
    seen.add(uri)
    result.push(uri)
    if (result.length >= MAX_URIS) {
      break
    }
  }
  return result
}

type SkillRow = {
  concept_uri: string
  skill_type: string | null
  reuse_level: string | null
  preferred_label_en: string
  preferred_label_fr: string
  description_en: string
  description_fr: string
  scope_note_en: string
  scope_note_fr: string
}

function normalizeSkillText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function displayKey(term: string, definition: string | null, scopeNote: string | null): string {
  return `${normalizeSkillText(term)}::${normalizeSkillText(definition)}::${normalizeSkillText(scopeNote)}`
}

function parseLocale(value: string | null): 'en' | 'fr' {
  return (value ?? '').toLowerCase() === 'fr' ? 'fr' : 'en'
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const uris = parseUris(searchParams.get('uris'))
    const locale = parseLocale(searchParams.get('locale'))

    if (uris.length === 0) {
      return NextResponse.json({ skills: [] })
    }

    const supabase = getSupabaseServer()
    const { data, error } = await supabase
      .from('esco_skills')
      .select(`
        concept_uri,
        skill_type,
        reuse_level,
        preferred_label_en,
        preferred_label_fr,
        description_en,
        description_fr,
        scope_note_en,
        scope_note_fr
      `)
      .in('concept_uri', uris)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const byUri = new Map<string, SkillRow>()
    for (const row of (data ?? []) as SkillRow[]) {
      byUri.set(row.concept_uri, row)
    }

    const seenDisplay = new Set<string>()
    const ordered = uris
      .map((uri) => byUri.get(uri))
      .filter((row): row is SkillRow => Boolean(row))
      .map((row) => {
        const term = locale === 'fr'
          ? (row.preferred_label_fr || row.preferred_label_en)
          : (row.preferred_label_en || row.preferred_label_fr)
        const definition = locale === 'fr'
          ? (row.description_fr || row.description_en || null)
          : (row.description_en || row.description_fr || null)
        const scope_note = locale === 'fr'
          ? (row.scope_note_fr || row.scope_note_en || null)
          : (row.scope_note_en || row.scope_note_fr || null)
        return {
          concept_uri: row.concept_uri,
          term,
          definition,
          scope_note,
          skill_type: row.skill_type,
          reuse_level: row.reuse_level,
        }
      })
      .filter((row) => {
        const key = displayKey(row.term, row.definition, row.scope_note)
        if (seenDisplay.has(key)) {
          return false
        }
        seenDisplay.add(key)
        return true
      })

    return NextResponse.json({ locale, skills: ordered })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch skills by URI'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
