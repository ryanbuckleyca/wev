import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test-utils';
import ToasterProvider from './Toaster';
import { Toaster as HotToaster } from 'react-hot-toast';

vi.mock('react-hot-toast', () => ({
  Toaster: vi.fn(() => null),
}));

describe('ToasterProvider', () => {
  it('uses top-center toaster defaults', () => {
    render(<ToasterProvider />);

    expect(HotToaster).toHaveBeenCalledWith(
      expect.objectContaining({
        position: 'top-center',
        toastOptions: expect.objectContaining({
          duration: 4000,
        }),
      }),
      undefined,
    );
  });
});
