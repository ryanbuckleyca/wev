import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import fc from 'fast-check';
import OrganizationCard from './OrganizationCard';
import type { OrgIndexEntry } from '@/lib/organizations/types';

// Mock @lineiconshq/react-lineicons to render a span with data-testid
vi.mock('@lineiconshq/react-lineicons', () => ({
  Leaf1Solid: 'Leaf1Solid',
  Lineicons: ({ icon }: { icon: any }) => <span data-testid="lineicon-mock" />,
}));

// Mock @lineiconshq/free-icons
vi.mock('@lineiconshq/free-icons', () => ({
  Leaf1Solid: 'Leaf1Solid',
  Lineicons: ({ icon }: { icon: any }) => <span data-testid="lineicon-mock" />,
}));

const baseProps = {
  locale: 'en',
  sseBadgeLabel: 'SSE',
  jobCountLabel: '5 jobs',
};

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
          values_list: null,
          values_rated: null,
          mission_statement: null,
          logo_url: null,
          created_at: new Date().toISOString(),
          active_job_count: 5,
        };

        const { unmount } = render(<OrganizationCard {...baseProps} org={org} />);

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
      fc.property(fc.stringMatching(/^[a-z0-9][a-z0-9-]*$/), (slug) => {
        const org: OrgIndexEntry = {
          id: 1,
          name: 'Test Org',
          slug,
          description: null,
          website: null,
          location: 'City',
          sse_rating: null,
          sse_details: null,
          is_sse: false,
          type: null,
          values: null,
          values_list: null,
          values_rated: null,
          mission_statement: null,
          logo_url: null,
          created_at: new Date().toISOString(),
          active_job_count: 5,
        };

        const { unmount } = render(<OrganizationCard {...baseProps} org={org} />);

        const link = screen.getByRole('link', { name: 'Test Org' });
        expect(link.getAttribute('href')).toBe(`/en/organizations/${slug}`);

        unmount();
      }),
    );
  });
});
