import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import Pagination from './Pagination';

let mockCurrentPage = 1;
let mockSetCurrentPage = vi.fn();

vi.mock('@/contexts/BulletinFilterContext', () => ({
  useBulletinFilterContext: () => ({
    currentPage: mockCurrentPage,
    setCurrentPage: mockSetCurrentPage,
  }),
}));

const defaultProps = {
  totalPages: 5,
  totalItems: 50,
  itemsPerPage: 10,
};

describe('Pagination', () => {
  beforeEach(() => {
    mockCurrentPage = 1;
    mockSetCurrentPage = vi.fn();
  });

  it('shows item range text', () => {
    render(<Pagination {...defaultProps} />);
    expect(screen.getByText(/Showing 1-10 of 50 jobs/)).toBeVisible();
  });

  it('shows singular "job" when totalItems is 1 and totalPages <= 1', () => {
    mockCurrentPage = 1;
    render(<Pagination totalPages={1} totalItems={1} itemsPerPage={10} />);
    expect(screen.getByText(/1 job\b/)).toBeVisible();
  });

  it('renders no navigation when totalPages <= 1', () => {
    mockCurrentPage = 1;
    render(<Pagination totalPages={1} totalItems={5} itemsPerPage={10} />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('disables Previous on first page', () => {
    mockCurrentPage = 1;
    render(<Pagination {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('disables Next on last page', () => {
    mockCurrentPage = 5;
    render(<Pagination {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('calls onPageChange with next page when Next is clicked', async () => {
    const user = userEvent.setup();
    mockCurrentPage = 2;
    render(<Pagination {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(mockSetCurrentPage).toHaveBeenCalledWith(3);
  });

  it('calls onPageChange with previous page when Previous is clicked', async () => {
    const user = userEvent.setup();
    mockCurrentPage = 3;
    render(<Pagination {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(mockSetCurrentPage).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange when a page number is clicked', async () => {
    const user = userEvent.setup();
    mockCurrentPage = 1;
    render(<Pagination {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: '3' }));
    expect(mockSetCurrentPage).toHaveBeenCalledWith(3);
  });

  it('renders page number buttons', () => {
    render(<Pagination {...defaultProps} />);
    [1, 2, 3, 4, 5].forEach((n) =>
      expect(screen.getByRole('button', { name: String(n) })).toBeVisible(),
    );
  });

  it('marks the current page with aria-current', () => {
    mockCurrentPage = 3;
    render(<Pagination {...defaultProps} />);
    expect(screen.getByRole('button', { name: '3' })).toHaveAttribute('aria-current', 'page');
  });

  it('highlights the current page with active class', () => {
    mockCurrentPage = 3;
    render(<Pagination {...defaultProps} />);
    expect(screen.getByRole('button', { name: '3' })).toHaveClass('bg-primary');
  });
});
