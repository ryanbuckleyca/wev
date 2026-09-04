import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test-utils';
import fc from 'fast-check';
import OrganizationJobRow from './OrganizationJobRow';
import type { OrgJobPosting } from '@/lib/organizations/types';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('@/contexts/ProfileContext', () => ({
  useProfile: () => ({ profile: null }),
}));

const ORG = { name: 'Acme Co-op', slug: 'acme-co-op' };

describe('OrganizationJobRow', () => {
  // Feature: organizations, Property 16
  it('Property 16: Job links use listing_url when safe', () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        const job: OrgJobPosting = {
          id: '123',
          job_title: 'Software Engineer',
          listing_url: url,
          date_posted: new Date().toISOString(),
          employment_type: 'Full-time',
          location: 'Remote',
          work_type: 'hybrid',
        };

        const { unmount } = render(<OrganizationJobRow job={job} org={ORG} />);

        const link = screen.getByRole('link', { name: 'Software Engineer' });
        expect(link.getAttribute('href')).toBe(url);
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');

        unmount();
      }),
    );
  });

  it('renders who/what/where/why/when details like the job board', () => {
    const job: OrgJobPosting = {
      id: '123',
      job_title: 'Coordinator',
      listing_url: 'https://example.com/job',
      date_posted: '2026-06-01T00:00:00.000Z',
      employment_type: 'full-time',
      location: 'Montreal, QC',
      work_type: 'hybrid',
      summary: 'Coordinate community programs and outreach.',
      wage: '$55,000',
      min_value: null,
      unit_text: null,
    };

    render(<OrganizationJobRow job={job} org={ORG} />);

    expect(screen.getByText('Who:')).toBeInTheDocument();
    expect(screen.getByText('What:')).toBeInTheDocument();
    expect(screen.getByText('Where:')).toBeInTheDocument();
    expect(screen.getByText('Why:')).toBeInTheDocument();
    expect(screen.getByText('When:')).toBeInTheDocument();
    expect(screen.getByText('Acme Co-op')).toBeInTheDocument();
    expect(screen.getByText('Coordinator')).toBeInTheDocument();
    expect(screen.getByText('Montreal, QC')).toBeInTheDocument();
    expect(screen.getByText('Coordinate community programs and outreach.')).toBeInTheDocument();
  });

  it('shows the title as plain text when the listing URL is missing', () => {
    const job: OrgJobPosting = {
      id: '123',
      job_title: 'Archived Role',
      listing_url: null,
      date_posted: '2026-01-01T00:00:00.000Z',
      employment_type: 'full-time',
      location: 'Toronto',
      work_type: 'office',
    };

    render(<OrganizationJobRow job={job} org={ORG} />);

    expect(screen.getByText('Archived Role')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Archived Role' })).not.toBeInTheDocument();
  });

  it('renders skill pills when the job has skills', () => {
    const job: OrgJobPosting = {
      id: '123',
      job_title: 'Coordinator',
      listing_url: 'https://example.com/job',
      date_posted: null,
      employment_type: 'full-time',
      location: 'Montreal',
      work_type: 'hybrid',
      skills: ['http://data.europa.eu/esco/skill/teamwork'],
      skill_labels: {
        'http://data.europa.eu/esco/skill/teamwork': {
          term: 'Teamwork',
          definition: 'Working with others',
          scope_note: null,
        },
      },
    };

    render(<OrganizationJobRow job={job} org={ORG} />);

    expect(screen.getByText('1 skill')).toBeInTheDocument();
  });
});
