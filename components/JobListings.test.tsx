import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import JobListings from './JobListings';
import { BulletinFilterContext } from '@/contexts/BulletinFilterContext';
import { BulletinFilterControls } from '@/lib/hooks/useBulletinFilters';

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: vi.fn(),
  Link: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('@lineiconshq/react-lineicons', () => vi.importActual('./test-utils/lineicons-mock.ts'));

function createMockFilters(overrides: Partial<BulletinFilterControls> = {}): BulletinFilterControls {
  return {
    ...overrides,
    hasAnyFilters: overrides.hasAnyFilters ?? false,
    clearAllFilters: overrides.clearAllFilters ?? vi.fn(),
  } as unknown as BulletinFilterControls;
}

function renderWithFilters(props: React.ComponentProps<typeof JobListings>, filters: BulletinFilterControls) {
  return render(
    <BulletinFilterContext.Provider value={filters}>
      <JobListings {...props} />
    </BulletinFilterContext.Provider>
  );
}

describe('JobListings empty state', () => {
  const defaultProps = {
    jobs: [],
    loading: false,
    error: null,
    isAdmin: false,
    userId: null,
    profile: null,
    totalJobsCount: 0,
  };

  it('does not show clear button when there are no filters applied', () => {
    const filters = createMockFilters({ hasAnyFilters: false });
    renderWithFilters({ ...defaultProps, totalJobsCount: 10 }, filters);

    expect(screen.getByText('No job postings found.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Clear all filters' })).not.toBeInTheDocument();
  });

  it('does not show clear button when total jobs is 0 (database is empty)', () => {
    const filters = createMockFilters({ hasAnyFilters: true });
    renderWithFilters({ ...defaultProps, totalJobsCount: 0 }, filters);

    expect(screen.getByText('No job postings found.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Clear all filters' })).not.toBeInTheDocument();
  });

  it('shows clear button and filtered counts when filters hide all jobs', () => {
    const filters = createMockFilters({ hasAnyFilters: true });
    renderWithFilters({ ...defaultProps, totalJobsCount: 12 }, filters);

    expect(screen.getByText('No job postings found.')).toBeVisible();
    expect(screen.getByText('Your filters are hiding all 12 available jobs.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Clear all filters' })).toBeVisible();
  });

  it('shows the edit profile link when user is logged in and filters hide all jobs', () => {
    const filters = createMockFilters({ hasAnyFilters: true });
    renderWithFilters({ ...defaultProps, totalJobsCount: 12, userId: 'user-1' }, filters);

    expect(screen.getByRole('link', { name: 'Edit in profile' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Edit in profile' })).toHaveAttribute('href', '/profile');
  });

  it('hides the edit profile link when user is logged out', () => {
    const filters = createMockFilters({ hasAnyFilters: true });
    renderWithFilters({ ...defaultProps, totalJobsCount: 12, userId: null }, filters);

    expect(screen.queryByRole('link', { name: 'Edit in profile' })).not.toBeInTheDocument();
  });

  it('calls clearAllFilters when the clear button is clicked', async () => {
    const user = userEvent.setup();
    const clearAllFilters = vi.fn();
    const filters = createMockFilters({ hasAnyFilters: true, clearAllFilters });
    
    renderWithFilters({ ...defaultProps, totalJobsCount: 12 }, filters);
    
    await user.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(clearAllFilters).toHaveBeenCalledOnce();
  });
});
