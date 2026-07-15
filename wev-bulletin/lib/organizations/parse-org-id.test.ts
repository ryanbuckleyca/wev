import { describe, it, expect } from 'vitest';
import { parseOrgId } from './parse-org-id';

describe('parseOrgId', () => {
  it('accepts positive integer strings and numbers', () => {
    expect(parseOrgId('42')).toBe(42);
    expect(parseOrgId(7)).toBe(7);
  });

  it('rejects invalid values', () => {
    expect(parseOrgId('0')).toBeNull();
    expect(parseOrgId('-1')).toBeNull();
    expect(parseOrgId('abc')).toBeNull();
    expect(parseOrgId(undefined)).toBeNull();
  });
});
