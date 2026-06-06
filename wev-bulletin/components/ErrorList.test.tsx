import { render, screen } from '@/test-utils';
import ErrorList from './ErrorList';
import { describe, expect, it } from 'vitest';

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
    const container = screen.getByRole('list').parentElement;
    expect(container?.className).toContain('custom-class');
  });
});
