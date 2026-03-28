import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import Pagination from './Pagination';

const defaultProps = {
  currentPage: 1,
  totalPages: 5,
  onPageChange: () => {},
  totalItems: 50,
  itemsPerPage: 10,
};

describe('Pagination', () => {
  it('shows item range text', () => {
    render(<Pagination {...defaultProps} />);
    expect(screen.getByText(/Showing 1-10 of 50 jobs/)).toBeVisible();
  });

  it('shows singular "job" when totalItems is 1 and totalPages <= 1', () => {
    render(
      <Pagination
        currentPage={1}
        totalPages={1}
        onPageChange={() => {}}
        totalItems={1}
        itemsPerPage={10}
      />,
    );
    expect(screen.getByText(/1 job\b/)).toBeVisible();
  });

  it('renders no navigation when totalPages <= 1', () => {
    render(
      <Pagination
        currentPage={1}
        totalPages={1}
        onPageChange={() => {}}
        totalItems={5}
        itemsPerPage={10}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('disables Previous on first page', () => {
    render(<Pagination {...defaultProps} currentPage={1} />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('disables Next on last page', () => {
    render(<Pagination {...defaultProps} currentPage={5} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('calls onPageChange with next page when Next is clicked', async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    render(<Pagination {...defaultProps} currentPage={2} onPageChange={handler} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(handler).toHaveBeenCalledWith(3);
  });

  it('calls onPageChange with previous page when Previous is clicked', async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    render(<Pagination {...defaultProps} currentPage={3} onPageChange={handler} />);

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(handler).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange when a page number button is clicked', async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    render(<Pagination {...defaultProps} currentPage={1} onPageChange={handler} />);

    await user.click(screen.getByRole('button', { name: '3' }));
    expect(handler).toHaveBeenCalledWith(3);
  });

  it('renders page number buttons', () => {
    render(<Pagination {...defaultProps} />);
    // With 5 total pages and maxVisible=5, all page numbers should show
    expect(screen.getByRole('button', { name: '1' })).toBeVisible();
    expect(screen.getByRole('button', { name: '2' })).toBeVisible();
    expect(screen.getByRole('button', { name: '3' })).toBeVisible();
    expect(screen.getByRole('button', { name: '4' })).toBeVisible();
    expect(screen.getByRole('button', { name: '5' })).toBeVisible();
  });

  it('shows ellipsis for many pages', () => {
    render(
      <Pagination
        currentPage={5}
        totalPages={10}
        onPageChange={() => {}}
        totalItems={100}
        itemsPerPage={10}
      />,
    );
    // Should show 1, ..., middle pages, ..., 10
    expect(screen.getAllByText('...').length).toBeGreaterThanOrEqual(1);
  });

  it('highlights the current page as primary variant', () => {
    render(<Pagination {...defaultProps} currentPage={3} />);
    const btn3 = screen.getByRole('button', { name: '3' });
    expect(btn3.className).toContain('bg-primary');
  });
});
