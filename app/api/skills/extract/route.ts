import { NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { getSupabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const MAX_TEXT_LENGTH = 10000
const SHORTLIST_LIMIT = 150
const MAX_SKILLS_RETURNED = 10

type SkillCandidate = {
  concept_uri: string
  term: string
  definition: string | null
}

type ExtractRequest = {
  text: string
  locale?: 'en' | 'fr'
}

type ExtractResponse = {
  skills: string[]
  error?: string
}

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new Error('GROQ_API_KEY environment variable is not set')
  }
  return new Groq({ apiKey })
}

async function getShortlistCandidates(
  text: string,
  locale: 'en' | 'fr'
): Promise<SkillCandidate[]> {
  const supabase = getSupabaseServer()
  
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 50)
  
  const uniqueWords = Array.from(new Set(words))
  const candidates = new Map<string, SkillCandidate>()

  for (const word of uniqueWords.slice(0, 20)) {
    const { data, error } = await supabase.rpc('search_esco_skills', {
      p_query: word,
      p_limit: 20,
      p_locale: locale,
    })

    if (!error && data) {
      for (const row of data as Array<{
        concept_uri: string
        term: string
        definition: string | null
      }>) {
        if (!candidates.has(row.concept_uri)) {
          candidates.set(row.concept_uri, {
            concept_uri: row.concept_uri,
            term: row.term,
            definition: row.definition,
          })
        }
        if (candidates.size >= SHORTLIST_LIMIT) {
          break
        }
      }
    }
    if (candidates.size >= SHORTLIST_LIMIT) {
      break
    }
  }

  return Array.from(candidates.values())
}

async function extractSkillsWithGroq(
  text: string,
  candidates: SkillCandidate[]
): Promise<string[]> {
  const groq = getGroqClient()

  const candidateList = candidates
    .map(
      (c, idx) =>
        `${idx + 1}. ${c.concept_uri} - ${c.term}${c.definition ? `: ${c.definition.slice(0, 150)}` : ''}`
    )
    .join('\n')

  const systemPrompt = `You are a skill extraction assistant. Given a job description or resume text and a list of ESCO skill candidates, identify the most relevant skills (up to ${MAX_SKILLS_RETURNED}).
  
 Return ONLY a valid JSON object with a single \"skills\" array of concept URIs, nothing else. Example: {"skills":["http://data.europa.eu/esco/skill/...", "http://data.europa.eu/esco/skill/..."]}
  
  Rules:
  - Return max ${MAX_SKILLS_RETURNED} skills
  - Only return URIs from the candidate list
  - Choose skills explicitly mentioned or strongly implied
- Prioritize specific technical skills over generic ones
- Return empty array [] if no relevant skills found`

  const userPrompt = `Text to analyze:
  ${text.slice(0, 2000)}
  
  Candidate skills:
  ${candidateList}
  
 Return JSON object with \"skills\" array of relevant concept URIs (max ${MAX_SKILLS_RETURNED}):`

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      return []
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      const match = content.match(/\[[\s\S]*\]/)
      if (match) {
        parsed = JSON.parse(match[0])
      } else {
        return []
      }
    }

    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === 'string')
        .slice(0, MAX_SKILLS_RETURNED)
    }

    if (typeof parsed === 'object' && parsed !== null) {
      const obj = parsed as Record<string, unknown>
      for (const key of ['skills', 'concept_uris', 'uris', 'results']) {
        if (Array.isArray(obj[key])) {
          return obj[key]
            .filter((item): item is string => typeof item === 'string')
            .slice(0, MAX_SKILLS_RETURNED)
        }
      }
    }

    return []
  } catch (error) {
    console.error('Groq API error:', error)
    throw new Error('Failed to extract skills with LLM')
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExtractRequest

    if (typeof body.text !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid "text" field' },
        { status: 400 }
      )
    }

    const text = body.text.trim().slice(0, MAX_TEXT_LENGTH)
    if (text.length === 0) {
      return NextResponse.json({ skills: [] })
    }

    const locale = body.locale === 'fr' ? 'fr' : 'en'

    const candidates = await getShortlistCandidates(text, locale)
    if (candidates.length === 0) {
      return NextResponse.json({ skills: [] })
    }

    const skillUris = await extractSkillsWithGroq(text, candidates)

    const response: ExtractResponse = {
      skills: skillUris,
    }

    return NextResponse.json(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to extract skills'
    console.error('Skill extraction error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
