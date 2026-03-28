import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import JobSearch from './JobSearch';
import type { ActiveFilterChip } from './JobSearch';

const defaultProps = {
  searchQuery: '',
  onSearchChange: () => {},
  filtersExpanded: false,
  onFiltersExpandedChange: () => {},
  activeFilterChips: [] as ActiveFilterChip[],
  filteredJobsCount: 10,
  totalJobsCount: 50,
  hasAnyFilters: false,
  isSuggestedDefaults: true,
  onClearAllFilters: () => {},
  onApplySuggestedDefaults: () => {},
};

function renderJobSearch(overrides: Partial<typeof defaultProps> = {}) {
  return render(<JobSearch {...defaultProps} {...overrides} />);
}

describe('JobSearch', () => {
  it('renders the search input with an accessible label', () => {
    renderJobSearch();
    expect(screen.getByLabelText('Search jobs')).toBeVisible();
  });

  it('shows the current search query in the input', () => {
    renderJobSearch({ searchQuery: 'designer' });
    expect(screen.getByLabelText('Search jobs')).toHaveValue('designer');
  });

  it('calls onSearchChange when the user types', async () => {
    const user = userEvent.setup();
    const handleSearch = vi.fn();
    renderJobSearch({ onSearchChange: handleSearch });

    await user.type(screen.getByLabelText('Search jobs'), 'a');
    expect(handleSearch).toHaveBeenCalledWith('a');
  });

  it('displays the filtered and total job counts', () => {
    renderJobSearch({ filteredJobsCount: 12, totalJobsCount: 100 });
    expect(screen.getByText('12')).toBeVisible();
    expect(screen.getByText(/of 100/)).toBeVisible();
  });

  it('uses the singular "job" when totalJobsCount is 1', () => {
    renderJobSearch({ filteredJobsCount: 1, totalJobsCount: 1 });
    expect(screen.getByText(/1 job$/)).toBeVisible();
  });

  it('uses the plural "jobs" when totalJobsCount is greater than 1', () => {
    renderJobSearch({ filteredJobsCount: 3, totalJobsCount: 5 });
    expect(screen.getByText(/5 jobs$/)).toBeVisible();
  });

  it('renders a filter toggle button showing the chip count', () => {
    const chips: ActiveFilterChip[] = [
      { id: '1', label: 'SSE only' },
      { id: '2', label: 'Posted: 2 weeks' },
    ];
    renderJobSearch({ activeFilterChips: chips });

    const filterBtn = screen.getByRole('button', { name: /filters/i });
    expect(filterBtn).toBeVisible();
    expect(filterBtn).toHaveTextContent('2');
  });

  it('calls onFiltersExpandedChange when the filter button is clicked', async () => {
    const user = userEvent.setup();
    const handleExpand = vi.fn();
    renderJobSearch({ onFiltersExpandedChange: handleExpand });

    await user.click(screen.getByRole('button', { name: /filters/i }));
    expect(handleExpand).toHaveBeenCalledWith(true);
  });

  it('renders active filter chips as removable pills', () => {
    const chips: ActiveFilterChip[] = [
      { id: 'sse', label: 'SSE only', onRemove: () => {} },
      { id: 'posted', label: 'Posted: 2 weeks', onRemove: () => {} },
    ];
    renderJobSearch({ activeFilterChips: chips });

    expect(screen.getByText('SSE only')).toBeVisible();
    expect(screen.getByText('Posted: 2 weeks')).toBeVisible();
  });

  it('calls chip onRemove when the remove button on a chip is clicked', async () => {
    const user = userEvent.setup();
    const handleRemoveSse = vi.fn();
    const chips: ActiveFilterChip[] = [
      { id: 'sse', label: 'SSE only', onRemove: handleRemoveSse },
      { id: 'posted', label: 'Posted: 2 weeks', onRemove: () => {} },
    ];
    renderJobSearch({ activeFilterChips: chips, hasAnyFilters: true });

    // The Pill's remove button has an aria-label like "Remove"
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    // Click the first remove button (SSE only chip)
    await user.click(removeButtons[0]);
    expect(handleRemoveSse).toHaveBeenCalledOnce();
  });

  it('shows "Show all jobs" link when filters are active', () => {
    renderJobSearch({ hasAnyFilters: true });
    expect(screen.getByRole('button', { name: 'Show all jobs' })).toBeVisible();
  });

  it('shows "Use suggested filters" link when not using suggested defaults', () => {
    renderJobSearch({ isSuggestedDefaults: false });
    expect(screen.getByRole('button', { name: 'Use suggested filters' })).toBeVisible();
  });

  it('calls onClearAllFilters when "Show all jobs" is clicked', async () => {
    const user = userEvent.setup();
    const handleClear = vi.fn();
    renderJobSearch({ hasAnyFilters: true, onClearAllFilters: handleClear });

    await user.click(screen.getByRole('button', { name: 'Show all jobs' }));
    expect(handleClear).toHaveBeenCalledOnce();
  });

  it('calls onApplySuggestedDefaults when "Use suggested filters" is clicked', async () => {
    const user = userEvent.setup();
    const handleDefaults = vi.fn();
    renderJobSearch({ isSuggestedDefaults: false, onApplySuggestedDefaults: handleDefaults });

    await user.click(screen.getByRole('button', { name: 'Use suggested filters' }));
    expect(handleDefaults).toHaveBeenCalledOnce();
  });

  it('hides action links when no filters are active and defaults are applied', () => {
    renderJobSearch({ hasAnyFilters: false, isSuggestedDefaults: true });

    expect(screen.queryByRole('button', { name: 'Show all jobs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use suggested filters' })).not.toBeInTheDocument();
  });

  it('sets aria-expanded on the filter toggle button', () => {
    const { rerender } = render(<JobSearch {...defaultProps} filtersExpanded={false} />);
    expect(screen.getByRole('button', { name: /filters/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    rerender(<JobSearch {...defaultProps} filtersExpanded={true} />);
    expect(screen.getByRole('button', { name: /filters/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
