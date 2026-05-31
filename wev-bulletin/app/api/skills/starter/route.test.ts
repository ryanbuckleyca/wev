import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFrom, mockSelect, mockOrder, mockLimit } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockOrder: vi.fn(),
  mockLimit: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: { from: mockFrom },
}));

import { GET } from './route';

describe('GET /api/skills/starter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ order: mockOrder });
    mockOrder.mockReturnValue({ limit: mockLimit });
  });

  it('returns a deduped starter list ordered by the locale label column', async () => {
    mockLimit.mockResolvedValue({
      data: [
        {
          concept_uri: 'uri-1',
          preferred_label_en: 'Archivist',
          preferred_label_fr: 'Archiviste',
          description_en: 'Manage archives',
          description_fr: 'Gerer des archives',
          scope_note_en: null,
          scope_note_fr: null,
          skill_type: 'skill',
          reuse_level: 'cross-sector',
        },
        {
          concept_uri: 'uri-2',
          preferred_label_en: 'Archivist',
          preferred_label_fr: 'Archiviste',
          description_en: 'Manage archives',
          description_fr: 'Gerer des archives',
          scope_note_en: null,
          scope_note_fr: null,
          skill_type: 'skill',
          reuse_level: 'cross-sector',
        },
        {
          concept_uri: 'uri-3',
          preferred_label_en: 'Cataloguing',
          preferred_label_fr: 'Catalogage',
          description_en: null,
          description_fr: null,
          scope_note_en: 'Maintain records',
          scope_note_fr: 'Tenir les dossiers a jour',
          skill_type: 'knowledge',
          reuse_level: 'transversal',
        },
      ],
      error: null,
    });

    const response = await GET(new Request('http://localhost/api/skills/starter?locale=fr&limit=2'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(mockOrder).toHaveBeenCalledWith('preferred_label_fr', {
      ascending: true,
      nullsFirst: false,
    });
    expect(mockLimit).toHaveBeenCalledWith(10);
    expect(body.skills).toEqual([
      expect.objectContaining({
        concept_uri: 'uri-1',
        term: 'Archiviste',
        definition: 'Gerer des archives',
      }),
      expect.objectContaining({
        concept_uri: 'uri-3',
        term: 'Catalogage',
        definition: 'Tenir les dossiers a jour',
      }),
    ]);
  });
});
