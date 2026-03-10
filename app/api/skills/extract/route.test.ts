import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseServer: vi.fn(() => ({
    rpc: vi.fn().mockResolvedValue({
      data: [
        {
          concept_uri: 'http://data.europa.eu/esco/skill/test1',
          term: 'JavaScript',
          definition: 'Programming language',
        },
      ],
      error: null,
    }),
  })),
}))

vi.mock('groq-sdk', () => {
  return {
    default: class MockGroq {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    skills: ['http://data.europa.eu/esco/skill/test1'],
                  }),
                },
              },
            ],
          }),
        },
      }
    },
  }
})

describe('POST /api/skills/extract', () => {
  beforeEach(() => {
    vi.stubEnv('GROQ_API_KEY', 'test-key')
  })

  it('returns empty array for empty text', async () => {
    const request = new Request('http://localhost/api/skills/extract', {
      method: 'POST',
      body: JSON.stringify({ text: '' }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(data.skills).toEqual([])
  })

  it('returns 400 for missing text field', async () => {
    const request = new Request('http://localhost/api/skills/extract', {
      method: 'POST',
      body: JSON.stringify({}),
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('extracts skills from job description text', async () => {
    const request = new Request('http://localhost/api/skills/extract', {
      method: 'POST',
      body: JSON.stringify({
        text: 'We are looking for a developer with JavaScript experience',
        locale: 'en',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(Array.isArray(data.skills)).toBe(true)
  })

  it('respects locale parameter', async () => {
    const request = new Request('http://localhost/api/skills/extract', {
      method: 'POST',
      body: JSON.stringify({
        text: 'Développeur avec expérience en JavaScript',
        locale: 'fr',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(Array.isArray(data.skills)).toBe(true)
  })
})
