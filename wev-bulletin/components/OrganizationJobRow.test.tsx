import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import fc from 'fast-check';
import OrganizationJobRow from './OrganizationJobRow';
import type { OrgJobPosting } from '@/lib/organizations/types';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, options?: any) => {
    return options?.fallback || key;
  },
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
      })
    );
  });
});
