import { describe, it, expect, vi, beforeEach } from 'vitest';
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
      <button
        aria-label={ariaPreviousLabel}
        disabled={current === 1}
        onClick={() => onPageChange(current - 1)}
      >
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
      <button
        aria-label={ariaNextLabel}
        disabled={current === total}
        onClick={() => onPageChange(current + 1)}
      >
        {nextLabel}
      </button>
    </nav>
  ),
}));

function makeProps(overrides: Partial<Parameters<typeof Pagination>[0]> = {}) {
  return {
    currentPage: 1,
    onPageChange: vi.fn(),
    totalPages: 5,
    totalItems: 50,
    itemsPerPage: 10,
    ...overrides,
  };
}

describe('Pagination', () => {
  it('shows item range text', () => {
    render(<Pagination {...makeProps()} />);
    expect(screen.getByText(/Showing 1-10 of 50 jobs/)).toBeVisible();
  });

  it('shows singular "job" when totalItems is 1 and totalPages <= 1', () => {
    render(<Pagination {...makeProps({ totalPages: 1, totalItems: 1 })} />);
    expect(screen.getByText(/1 job\b/)).toBeVisible();
  });

  it('renders no navigation when totalPages <= 1', () => {
    render(<Pagination {...makeProps({ totalPages: 1, totalItems: 5 })} />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('disables Previous on first page', () => {
    render(<Pagination {...makeProps({ currentPage: 1 })} />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('disables Next on last page', () => {
    render(<Pagination {...makeProps({ currentPage: 5 })} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('calls onPageChange with next page when Next is clicked', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination {...makeProps({ currentPage: 2, onPageChange })} />);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('calls onPageChange with previous page when Previous is clicked', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination {...makeProps({ currentPage: 3, onPageChange })} />);
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange when a page number is clicked', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination {...makeProps({ currentPage: 1, onPageChange })} />);
    await user.click(screen.getByRole('button', { name: '3' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('renders page number buttons', () => {
    render(<Pagination {...makeProps()} />);
    [1, 2, 3, 4, 5].forEach((n) =>
      expect(screen.getByRole('button', { name: String(n) })).toBeVisible(),
    );
  });

  it('marks the current page with aria-current', () => {
    render(<Pagination {...makeProps({ currentPage: 3 })} />);
    expect(screen.getByRole('button', { name: '3' })).toHaveAttribute('aria-current', 'page');
  });

  it('highlights the current page with active class', () => {
    render(<Pagination {...makeProps({ currentPage: 3 })} />);
    expect(screen.getByRole('button', { name: '3' })).toHaveClass('bg-primary');
  });
});
