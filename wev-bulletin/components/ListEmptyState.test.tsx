import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import ListEmptyState from './ListEmptyState';

describe('ListEmptyState', () => {
  it('shows the plain empty message when there are no items', () => {
    render(
      <ListEmptyState
        emptyMessage="No organizations found."
        filteredMessage="Your filters are hiding all 5 available organizations."
        hasFilters={false}
        totalAvailable={0}
        clearFiltersLabel="Clear all filters"
      />,
    );

    expect(screen.getByText('No organizations found.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Clear all filters' })).not.toBeInTheDocument();
  });

  it('shows the filtered prompt when filters hide available items', async () => {
    const user = userEvent.setup();
    const onClearFilters = vi.fn();

    render(
      <ListEmptyState
        emptyMessage="No organizations found."
        filteredMessage="Your filters are hiding all 5 available organizations."
        hasFilters
        totalAvailable={5}
        onClearFilters={onClearFilters}
        clearFiltersLabel="Clear all filters"
      />,
    );

    expect(
      screen.getByText('Your filters are hiding all 5 available organizations.'),
    ).toBeVisible();
    expect(screen.queryByText('No organizations found.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(onClearFilters).toHaveBeenCalledOnce();
  });

  it('does not prompt to clear filters when the underlying set is empty', () => {
    render(
      <ListEmptyState
        emptyMessage="No organizations found."
        filteredMessage="Your filters are hiding all 0 available organizations."
        hasFilters
        totalAvailable={0}
        onClearFilters={vi.fn()}
        clearFiltersLabel="Clear all filters"
      />,
    );

    expect(screen.getByText('No organizations found.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Clear all filters' })).not.toBeInTheDocument();
  });
});
