import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test-utils';
import ToasterProvider from './Toaster';
import { Toaster as HotToaster } from 'react-hot-toast';

vi.mock('react-hot-toast', () => ({
  default: {
    dismiss: vi.fn(),
  },
  Toaster: vi.fn(() => null),
  ToastBar: vi.fn(() => null),
}));

describe('ToasterProvider', () => {
  it('uses top-center toaster defaults', () => {
    render(<ToasterProvider />);

    expect(HotToaster).toHaveBeenCalledWith(
      expect.objectContaining({
        position: 'top-center',
        containerStyle: expect.objectContaining({
          pointerEvents: 'none',
        }),
        toastOptions: expect.objectContaining({
          duration: 4000,
          style: expect.objectContaining({
            pointerEvents: 'auto',
          }),
        }),
      }),
      undefined,
    );
  });
});
