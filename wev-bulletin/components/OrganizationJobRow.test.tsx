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

describe('OrganizationJobRow', () => {
  // Feature: organizations, Property 16
  it('Property 16: Job links use listing_url', () => {
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

        const { unmount } = render(<OrganizationJobRow job={job} />);

        const link = screen.getByRole('link');
        expect(link.getAttribute('href')).toBe(url);
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');

        unmount();
      }),
    );
  });

  it('renders existing work type translations instead of missing message keys', () => {
    const job: OrgJobPosting = {
      id: '123',
      job_title: 'Software Engineer',
      listing_url: 'https://example.com/job',
      date_posted: null,
      employment_type: 'full-time',
      location: 'Remote',
      work_type: 'hybrid',
    };

    render(<OrganizationJobRow job={job} />);

    expect(screen.getByText('Hybrid')).toBeInTheDocument();
    expect(screen.getByText('Full-time')).toBeInTheDocument();
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

    render(<OrganizationJobRow job={job} />);

    expect(screen.getByText('1 skill')).toBeInTheDocument();
  });
});
