import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetchOrganizationIndex, mockFetchOrganizationFilterOptions } = vi.hoisted(() => ({
  mockFetchOrganizationIndex: vi.fn(),
  mockFetchOrganizationFilterOptions: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null } })),
    },
  })),
}));

vi.mock('@/lib/organizations/server-data', () => ({
  fetchOrganizationIndex: mockFetchOrganizationIndex,
  fetchOrganizationFilterOptions: mockFetchOrganizationFilterOptions,
}));

import { GET } from './route';

describe('GET /api/organizations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchOrganizationIndex.mockResolvedValue({
      orgs: [],
      total: 0,
      totalAvailable: 10,
    });
    mockFetchOrganizationFilterOptions.mockResolvedValue({
      types: [],
      provinces: [],
      municipalitiesByProvince: {},
      languages: [],
      sectors: [],
      availableTypes: [],
      availableProvinces: [],
      availableMunicipalitiesByProvince: {},
      availableLanguages: [],
      availableSectors: [],
    });
  });

  it('forwards sector query params to fetchOrganizationIndex', async () => {
    const response = await GET(
      new Request(
        'http://localhost/api/organizations?sector=arts-culture-information&sector=community-civic-infrastructure',
      ),
    );

    expect(response.status).toBe(200);
    expect(mockFetchOrganizationIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        sectors: ['arts-culture-information', 'community-civic-infrastructure'],
      }),
      undefined,
    );
  });
});
