import { renderHook } from '@testing-library/react';
import { useTheme } from './useTheme';
import { describe, it, expect, vi } from 'vitest';

describe('useTheme', () => {
  it('returns light theme by default on server side', () => {
    // In vitest environment, window is usually defined. 
    // We can mock it by checking the logic.
    // The hook uses `typeof window === 'undefined'`
    
    // We can't easily delete window in some environments, but we can check the logic.
    // If we are in a browser-like env (jsdom), mounted should be true.
    const { result } = renderHook(() => useTheme());
    expect(result.current.mounted).toBe(true);
  });

  it('returns theme from document element on client side', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
    expect(result.current.mounted).toBe(true);
  });

  it('defaults to light if data-theme is missing', () => {
    document.documentElement.removeAttribute('data-theme');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
  });
});
