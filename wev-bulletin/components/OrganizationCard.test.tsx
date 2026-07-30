import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test-utils';
import fc from 'fast-check';
import OrganizationCard from './OrganizationCard';
import type { OrgIndexEntry } from '@/lib/organizations/types';

const baseProps = {
  locale: 'en',
  sseBadgeLabel: 'SSE',
  jobCountLabel: '5 jobs',
  noDescriptionLabel: 'No description available.',
  websiteLabel: 'Website',
  viewProfileLabel: 'View profile',
  showMoreLabel: 'Show more',
  showLessLabel: 'Show less',
  isLoggedIn: false,
};

function makeOrg(overrides: Partial<OrgIndexEntry> = {}): OrgIndexEntry {
  return {
    id: 1,
    name: 'Test Org',
    slug: 'test-org',
    description: null,
    description_en: null,
    description_fr: null,
    website: null,
    location: 'City',
    municipality: null,
    province: null,
    is_sse: false,
    type: null,
    sector_id: null,
    values_list: null,
    mission_statement: null,
    mission_statement_en: null,
    mission_statement_fr: null,
    language: null,
    active_job_count: 5,
    total_count: 1,
    value_score: null,
    shared_values: null,
    ...overrides,
  };
}

describe('OrganizationCard', () => {
  // Feature: organizations, Property 14
  it('Property 14: SSE badge renders iff is_sse is true', () => {
    fc.assert(
      fc.property(fc.boolean(), (is_sse) => {
        const org = makeOrg({ is_sse, location: null });

        const { unmount } = render(<OrganizationCard {...baseProps} org={org} />);

        const badge = screen.queryByRole('img', { name: 'SSE' });
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
    const slugArb = fc.stringMatching(/^[a-z0-9]([a-z0-9-]{0,62})?$/);

    fc.assert(
      fc.property(slugArb, (slug) => {
        const org = makeOrg({ slug });

        const { unmount } = render(<OrganizationCard {...baseProps} org={org} />);

        const link = screen.getByRole('link', { name: 'Test Org' });
        expect(link.getAttribute('href')).toBe(`/en/organizations/${slug}`);

        unmount();
      }),
      { numRuns: 25 },
    );
  });

  it('shows a location pill in the footer when location is present', () => {
    render(
      <OrganizationCard
        {...baseProps}
        org={makeOrg({ location: null, municipality: 'Montreal', province: 'QC' })}
      />,
    );

    expect(screen.getByText('Montreal, QC')).toBeInTheDocument();
  });

  it('shows a location pill from free-text location when mun/province are missing', () => {
    render(<OrganizationCard {...baseProps} org={makeOrg({ location: 'Toronto' })} />);

    expect(screen.getByText('Toronto')).toBeInTheDocument();
  });

  it('shows a language pill when org language is set and filter matches', () => {
    render(
      <OrganizationCard
        {...baseProps}
        org={makeOrg({ language: 'bilingual', location: null })}
        selectedLanguages={['bilingual']}
      />,
    );

    const pill = screen.getByText('Bilingual');
    expect(pill).toBeInTheDocument();
    expect(pill.closest('div')).not.toHaveClass('opacity-60');
  });

  it('shows a language pill when org language is set but filter does not match', () => {
    render(
      <OrganizationCard
        {...baseProps}
        org={makeOrg({ language: 'bilingual', location: null })}
        selectedLanguages={['en']}
      />,
    );

    const pill = screen.getByText('Bilingual');
    expect(pill).toBeInTheDocument();
    expect(pill.closest('div')).toHaveClass('opacity-60');
  });
});
