import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import Pagination from './Pagination';

vi.mock('react-responsive-pagination', () => ({
  default: ({
    current,
    total,
    onPageChange,
    previousLabel,
    nextLabel,
    ariaPreviousLabel,
    ariaNextLabel,
  }: {
    current: number;
    total: number;
    onPageChange: (page: number) => void;
    previousLabel?: string;
    nextLabel?: string;
    ariaPreviousLabel?: string;
    ariaNextLabel?: string;
  }) => (
    <nav aria-label="Pagination">
      <button aria-label={ariaPreviousLabel} disabled={current === 1} onClick={() => onPageChange(current - 1)}>
        {previousLabel}
      </button>
      {Array.from({ length: total }, (_, i) => i + 1).map((page) => (
        <button
          key={page}
          onClick={() => onPageChange(page)}
          aria-current={page === current ? 'page' : undefined}
          className={page === current ? 'bg-primary' : ''}
        >
          {page}
        </button>
      ))}
      <button aria-label={ariaNextLabel} disabled={current === total} onClick={() => onPageChange(current + 1)}>
        {nextLabel}
      </button>
    </nav>
  ),
}));

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
    render(<Pagination currentPage={1} totalPages={1} onPageChange={() => {}} totalItems={1} itemsPerPage={10} />);
    expect(screen.getByText(/1 job\b/)).toBeVisible();
  });

  it('renders no navigation when totalPages <= 1', () => {
    render(<Pagination currentPage={1} totalPages={1} onPageChange={() => {}} totalItems={5} itemsPerPage={10} />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
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

  it('calls onPageChange when a page number is clicked', async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    render(<Pagination {...defaultProps} currentPage={1} onPageChange={handler} />);
    await user.click(screen.getByRole('button', { name: '3' }));
    expect(handler).toHaveBeenCalledWith(3);
  });

  it('renders page number buttons', () => {
    render(<Pagination {...defaultProps} />);
    [1, 2, 3, 4, 5].forEach((n) => expect(screen.getByRole('button', { name: String(n) })).toBeVisible());
  });

  it('marks the current page with aria-current', () => {
    render(<Pagination {...defaultProps} currentPage={3} />);
    expect(screen.getByRole('button', { name: '3' })).toHaveAttribute('aria-current', 'page');
  });

  it('highlights the current page with active class', () => {
    render(<Pagination {...defaultProps} currentPage={3} />);
    expect(screen.getByRole('button', { name: '3' })).toHaveClass('bg-primary');
  });
});
