import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: { rpc: mockRpc },
}));

import { GET } from './route';

describe('GET /api/skills/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns [] for empty/short query and does not call supabase', async () => {
    const response = await GET(new Request('http://localhost/api/skills/search?q='));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.skills).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('ranks term matches above definition-only matches', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          concept_uri: 'skill-def',
          term: 'Community facilitation',
          definition: 'Contains data governance procedures.',
          scope_note: null,
          skill_type: 'skill',
          reuse_level: 'cross-sector',
          matched_alias: null,
          score: 100,
        },
        {
          concept_uri: 'skill-term',
          term: 'Data governance',
          definition: 'Policies and controls.',
          scope_note: null,
          skill_type: 'knowledge',
          reuse_level: 'transversal',
          matched_alias: 'govern data',
          score: 500,
        },
      ],
      error: null,
    });

    const response = await GET(new Request('http://localhost/api/skills/search?q=data'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.skills.map((s: { concept_uri: string }) => s.concept_uri)).toEqual([
      'skill-term',
      'skill-def',
    ]);
    expect(body.skills[0]).toMatchObject({
      concept_uri: 'skill-term',
      term: 'Data governance',
      matched_alias: 'govern data',
    });
  });

  it('dedupes identical term+definition rows and keeps the highest-ranked one', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          concept_uri: 'skill-dup-low',
          term: 'Advising and consulting',
          definition: 'Excludes behavioural counselling.',
          scope_note: null,
          skill_type: 'skill',
          reuse_level: 'cross-sector',
          matched_alias: null,
          score: 350,
        },
        {
          concept_uri: 'skill-dup-high',
          term: 'Advising and consulting',
          definition: 'Excludes behavioural counselling.',
          scope_note: null,
          skill_type: 'skill',
          reuse_level: 'cross-sector',
          matched_alias: null,
          score: 500,
        },
        {
          concept_uri: 'skill-unique',
          term: 'Consult team on creative project',
          definition: null,
          scope_note: null,
          skill_type: 'knowledge',
          reuse_level: 'transversal',
          matched_alias: null,
          score: 500,
        },
      ],
      error: null,
    });

    const response = await GET(new Request('http://localhost/api/skills/search?q=consult'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ concept_uri: 'skill-dup-high' }),
        expect.objectContaining({ concept_uri: 'skill-unique' }),
      ]),
    );
    expect(body.skills).toHaveLength(2);
  });
});
