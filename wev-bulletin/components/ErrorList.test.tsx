import { render, screen } from '@/test-utils';
import ErrorList from './ErrorList';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom';

describe('ErrorList', () => {
  it('renders nothing if errors array is empty', () => {
    const { container } = render(<ErrorList errors={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a list of errors', () => {
    render(<ErrorList errors={['Error 1', 'Error 2']} />);
    expect(screen.getByText('Error 1')).toBeInTheDocument();
    expect(screen.getByText('Error 2')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<ErrorList errors={['Error 1']} className="custom-class" />);
    const list = screen.getByRole('list');
    const container = list.parentElement;
    expect(container).toHaveClass('custom-class');
  });
});
