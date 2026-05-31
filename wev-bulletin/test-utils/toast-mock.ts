import { vi } from 'vitest';

export const notifyMock = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  dismiss: vi.fn(),
};

export default notifyMock;
