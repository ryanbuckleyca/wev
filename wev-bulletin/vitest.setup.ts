import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { act } from 'react';
import { beforeAll, afterAll, afterEach, vi } from 'vitest';

// `server-only` throws when imported outside Next server; Vitest runs in Node.
vi.mock('server-only', () => ({}));

// Set up Supabase env vars for tests
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key';
// Required by supabase-server.ts (throws at module load if missing)
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

process.env.VITEST = 'true';
process.env.LOG_LEVEL = 'silent';

// Mock matchMedia for useTouchDevice hook
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }),
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  // cmdk relies on ResizeObserver; jsdom does not provide it.
  (globalThis as unknown as { ResizeObserver?: typeof ResizeObserverMock }).ResizeObserver =
    ResizeObserverMock;
}

// React 19 is stricter about act() boundaries than React 18. When components
// use async effects with fake timers (e.g. polling), microtask-scheduled state
// updates can land just after an act() boundary closes, triggering a spurious
// warning. This is a known React 19 + Testing Library interop issue.
// See: https://github.com/testing-library/react-testing-library/issues/1297
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = (...args: Parameters<typeof console.error>) => {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (msg.includes('was not wrapped in act(')) return;
    originalConsoleError(...args);
  };
});

afterAll(() => {
  console.error = originalConsoleError;
});

afterEach(async () => {
  await act(async () => {
    cleanup();
  });
});
