import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@/test-utils'
import { useRequireAuth } from '@/lib/hooks/useRequireAuth'
import { useProfile } from '@/lib/hooks/useProfile'
import ProfilePage from './page'

vi.mock('@/lib/hooks/useRequireAuth', () => ({
  useRequireAuth: vi.fn(),
}))

vi.mock('@/lib/hooks/useProfile', () => ({
  useProfile: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    prefetch: _prefetch,
    ...props
  }: {
    href: string
    children: ReactNode
    prefetch?: boolean
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

const baseProfile = {
  id: 'user-1',
  full_name: 'Test User',
  bio: 'Bio',
  values: [],
  skills: ['uri-1'],
  work_types: ['remote'],
  ideal_work_environment: 'Calm, collaborative, flexible hours.',
  profile_photo_url: null,
  created_at: '2026-03-06T00:00:00.000Z',
  updated_at: '2026-03-06T00:00:00.000Z',
}

function jsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )
}

describe('ProfilePage skills integration', () => {
  const mockUpdateProfile = vi.fn()
  const mockUploadPhoto = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useRequireAuth).mockReturnValue({
      user: { id: 'user-1', email: 'user@example.com' },
      loading: false,
    } as never)
    vi.mocked(useProfile).mockReturnValue({
      profile: baseProfile,
      loading: false,
      error: null,
      isUpdating: false,
      refresh: vi.fn(),
      updateProfile: mockUpdateProfile,
      uploadPhoto: mockUploadPhoto,
    } as never)
    mockUpdateProfile.mockResolvedValue(baseProfile)
    mockUploadPhoto.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('hydrates existing skills on mount via /api/skills/by-uri', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/skills/by-uri?uris=uri-1&locale=en')) {
        return jsonResponse({
          skills: [
            {
              concept_uri: 'uri-1',
              term: 'Data analysis',
              definition: 'Analyze structured datasets.',
              scope_note: null,
              skill_type: 'knowledge',
              reuse_level: 'cross-sector',
            },
          ],
        })
      }
      if (url.startsWith('/api/skills/all?locale=en')) {
        return jsonResponse([
          {
            uri: 'uri-1',
            preferredLabel: { en: 'Data analysis', fr: 'Analyse de données' },
            definition: { en: 'Analyze structured datasets.', fr: 'Analyser des ensembles de données structurées.' },
            skillType: 'knowledge',
            reuseLevel: 'cross-sector',
          },
        ])
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ProfilePage />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/skills/by-uri?uris=uri-1&locale=en')
    })
    expect(await screen.findByText('Data analysis')).toBeInTheDocument()
  })

  it('removing a chip updates form data and save payload', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/skills/by-uri?uris=uri-1&locale=en')) {
        return jsonResponse({
          skills: [
            {
              concept_uri: 'uri-1',
              term: 'Data analysis',
              definition: 'Analyze structured datasets.',
              scope_note: null,
              skill_type: 'knowledge',
              reuse_level: 'cross-sector',
            },
          ],
        })
      }
      if (url.startsWith('/api/skills/all?locale=en')) {
        return jsonResponse([
          {
            uri: 'uri-1',
            preferredLabel: { en: 'Data analysis', fr: 'Analyse de données' },
            definition: { en: 'Analyze structured datasets.', fr: 'Analyser des ensembles de données structurées.' },
            skillType: 'knowledge',
            reuseLevel: 'cross-sector',
          },
        ])
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ProfilePage />)

    const removeButton = await screen.findByRole('button', {
      name: /remove data analysis/i,
    })
    await user.click(removeButton)
    await user.click(screen.getByRole('button', { name: /save profile/i }))

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalled()
    })
    expect(mockUpdateProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        skills: [],
      })
    )
  })

  it('saves concept_uri[] (not labels) after selecting a search result', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/skills/by-uri?uris=uri-1&locale=en')) {
        return jsonResponse({
          skills: [
            {
              concept_uri: 'uri-1',
              term: 'Data analysis',
              definition: 'Analyze structured datasets.',
              scope_note: null,
              skill_type: 'knowledge',
              reuse_level: 'cross-sector',
            },
          ],
        })
      }
      if (url.startsWith('/api/skills/all?locale=en')) {
        return jsonResponse([
          {
            uri: 'uri-1',
            preferredLabel: { en: 'Data analysis', fr: 'Analyse de données' },
            definition: { en: 'Analyze structured datasets.', fr: 'Analyser des ensembles de données structurées.' },
            skillType: 'knowledge',
            reuseLevel: 'cross-sector',
          },
          {
            uri: 'uri-2',
            preferredLabel: { en: 'Data governance', fr: 'Gouvernance des données' },
            definition: { en: 'Manage data controls.', fr: 'Gérer les contrôles de données.' },
            skillType: 'skill',
            reuseLevel: 'transversal',
            aliases: ['govern data'],
          },
        ])
      }
      if (url.startsWith('/api/skills/search?')) {
        return jsonResponse({
          skills: [
            {
              concept_uri: 'uri-2',
              term: 'Data governance',
              definition: 'Manage data controls.',
              scope_note: null,
              skill_type: 'skill',
              reuse_level: 'transversal',
              matched_alias: 'govern data',
            },
          ],
        })
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ProfilePage />)

    const searchInput = await screen.findByPlaceholderText('Search skills...')
    await user.type(searchInput, 'da')
    await new Promise((resolve) => setTimeout(resolve, 350))

    // Now we expect /api/skills/all to be called (for client-side filtering)
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/skills/all?locale=en')
    })

    await user.click(await screen.findByText('Data governance'))
    await user.click(screen.getByRole('button', { name: /save profile/i }))

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalled()
    })

    expect(mockUpdateProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        skills: ['uri-1', 'uri-2'],
      })
    )
  })

  it('blocks save and shows error when skills exceed limit', async () => {
    const user = userEvent.setup()
    const profileWithManySkills = {
      ...baseProfile,
      skills: Array.from({ length: 7 }, (_, i) => `uri-${i + 1}`),
    }
    vi.mocked(useProfile).mockReturnValue({
      profile: profileWithManySkills,
      loading: false,
      error: null,
      isUpdating: false,
      refresh: vi.fn(),
      updateProfile: mockUpdateProfile,
      uploadPhoto: mockUploadPhoto,
    } as never)

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/skills/by-uri?uris=')) {
        return jsonResponse({
          skills: Array.from({ length: 7 }, (_, i) => ({
            concept_uri: `uri-${i + 1}`,
            term: `Skill ${i + 1}`,
            definition: null,
            scope_note: null,
            skill_type: 'skill',
            reuse_level: 'cross-sector',
          })),
        })
      }
      if (url.startsWith('/api/skills/all?locale=en')) {
        return jsonResponse(
          Array.from({ length: 7 }, (_, i) => ({
            uri: `uri-${i + 1}`,
            preferredLabel: { en: `Skill ${i + 1}`, fr: `Compétence ${i + 1}` },
            definition: { en: null, fr: null },
            skillType: 'skill',
            reuseLevel: 'cross-sector',
          }))
        )
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ProfilePage />)

    await screen.findByRole('button', { name: /save profile/i })
    await user.click(screen.getByRole('button', { name: /save profile/i }))

    // Save should be blocked — updateProfile must not be called
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(mockUpdateProfile).not.toHaveBeenCalled()
  })
})
