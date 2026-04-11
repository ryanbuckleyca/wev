import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test-utils';
import BannerMessage from './BannerMessage';

describe('BannerMessage', () => {
  it('renders the message text', () => {
    render(<BannerMessage type="success" message="Profile saved" />);
    expect(screen.getByText('Profile saved')).toBeInTheDocument();
  });

  it('has role="alert" for screen readers', () => {
    render(<BannerMessage type="error" message="Something went wrong" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it.each(['success', 'error', 'warning', 'info'] as const)(
    'applies the correct type class for %s',
    (type) => {
      const typeClassMap = {
        success: 'design-toast-success',
        error: 'design-toast-alert',
        warning: 'design-toast-warning',
        info: 'design-toast-info',
      };
      const { container } = render(<BannerMessage type={type} message="Test" />);
      expect(container.firstChild).toHaveClass(typeClassMap[type]);
    },
  );
});
