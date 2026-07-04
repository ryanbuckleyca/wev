import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import fc from 'fast-check';
import OrganizationCard from './OrganizationCard';
import type { OrgIndexEntry } from '@/lib/organizations/types';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: any) => {
    if (key === 'jobs' && values) return `${values.count} jobs`;
    return key;
  },
  useLocale: () => 'en',
}));

// Mock @lineiconshq/react-lineicons to render a span with data-testid
vi.mock('@lineiconshq/react-lineicons', () => ({
  Lineicons: ({ icon }: { icon: any }) => <span data-testid="lineicon-mock" />,
}));

// Mock @lineiconshq/free-icons
vi.mock('@lineiconshq/free-icons', () => ({
  Leaf1Solid: 'Leaf1Solid',
  Lineicons: ({ icon }: { icon: any }) => <span data-testid="lineicon-mock" />,
}));

describe('OrganizationCard', () => {
  // Feature: organizations, Property 14
  it('Property 14: SSE badge renders iff is_sse is true', () => {
    fc.assert(
      fc.property(fc.boolean(), (is_sse) => {
        const org: OrgIndexEntry = {
          id: 1,
          name: 'Test Org',
          slug: 'test-org',
          description: null,
          website: null,
          location: 'City',
          sse_rating: null,
          sse_details: null,
          is_sse,
          type: null,
          values: null,
          logo_url: null,
          created_at: new Date().toISOString(),
          active_job_count: 5,
        };

        const { unmount } = render(<OrganizationCard org={org} />);

        const badge = screen.queryByTestId('lineicon-mock');
        if (is_sse) {
          expect(badge).toBeInTheDocument();
        } else {
          expect(badge).not.toBeInTheDocument();
        }

        unmount();
      }),
    );
  });

  // Feature: organizations, Property 15
  it("Property 15: Index entry links use the org's slug", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (slug) => {
        const cleanSlug = encodeURIComponent(slug); // to avoid invalid hrefs in test
        const org: OrgIndexEntry = {
          id: 1,
          name: 'Test Org',
          slug: cleanSlug,
          description: null,
          website: null,
          location: 'City',
          sse_rating: null,
          sse_details: null,
          is_sse: false,
          type: null,
          values: null,
          logo_url: null,
          created_at: new Date().toISOString(),
          active_job_count: 5,
        };

        const { unmount } = render(<OrganizationCard org={org} />);

        const link = screen.getByRole('link', { name: 'Test Org' });
        expect(link.getAttribute('href')).toBe(`/en/organizations/${cleanSlug}`);

        unmount();
      }),
    );
  });
});
