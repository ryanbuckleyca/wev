import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePasswordStrength } from './usePasswordStrength';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.has = (key: string) => true;
    return t;
  },
}));

// Mock checkPasswordStrength
vi.mock('@/lib/password-strength', () => ({
  checkPasswordStrength: vi.fn((password) => ({
    score: password.length,
    label: 'fair',
    color: 'yellow',
    isAcceptable: password.length > 5,
    feedbackKey: 'tooShort',
    feedbackIsWarning: true,
  })),
}));

describe('usePasswordStrength', () => {
  it('returns null if password is empty', () => {
    const { result } = renderHook(() => usePasswordStrength(''));
    expect(result.current).toBeNull();
  });

  it('returns strength result for a password', () => {
    const { result } = renderHook(() => usePasswordStrength('123456'));
    expect(result.current).toEqual({
      score: 6,
      label: 'fair',
      color: 'yellow',
      isAcceptable: true,
      feedback: 'feedback.warnings.tooShort',
    });
  });

  it('updates when password changes', () => {
    const { result, rerender } = renderHook(({ password }) => usePasswordStrength(password), {
      initialProps: { password: '123' },
    });

    expect(result.current?.isAcceptable).toBe(false);

    rerender({ password: '123456' });
    expect(result.current?.isAcceptable).toBe(true);
  });
});
