import { zxcvbn } from '@zxcvbn-ts/core';

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
  /** Raw feedback key from zxcvbn (e.g. "anotherWord", "extendedRepeat"). Translate in the presentation layer. */
  feedbackKey: string;
  /** Whether the key is a warning (true) or suggestion (false) */
  feedbackIsWarning: boolean;
  isAcceptable: boolean;
};

const STRENGTH_COLORS = [
  'var(--destructive-solid)', // 0 Very Weak - red
  'var(--warn-solid)', // 1 Weak - orange
  'var(--info-solid)', // 2 Fair - blue
  'var(--success-solid)', // 3 Good - green
  'var(--success-solid)', // 4 Strong - green
];

export function checkPasswordStrength(
  password: string,
  labels?: {
    veryWeak: string;
    weak: string;
    fair: string;
    good: string;
    strong: string;
  },
): PasswordStrength {
  const result = zxcvbn(password);

  const strengthLabels = labels
    ? [labels.veryWeak, labels.weak, labels.fair, labels.good, labels.strong]
    : ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];

  let feedbackKey = '';
  let feedbackIsWarning = false;
  if (result.feedback.warning) {
    feedbackKey = result.feedback.warning;
    feedbackIsWarning = true;
  } else if (result.feedback.suggestions.length > 0) {
    feedbackKey = result.feedback.suggestions[0];
  }

  return {
    score: result.score as 0 | 1 | 2 | 3 | 4,
    label: strengthLabels[result.score],
    color: STRENGTH_COLORS[result.score],
    feedbackKey,
    feedbackIsWarning,
    isAcceptable: result.score >= 2,
  };
}

/**
 * Shared strength floor for both the client form and the server signup route,
 * so the server can't accept a password the client would have rejected.
 * Mirrors `isAcceptable` above (zxcvbn score ≥ 2 / "Fair").
 */
export function isPasswordStrongEnough(password: string): boolean {
  return checkPasswordStrength(password).isAcceptable;
}
