import { describe, it, expect } from 'vitest';
import { buildPaginationTokens } from './Pagination';

describe('buildPaginationTokens', () => {
  it('returns all pages when total is 7 or less', () => {
    expect(buildPaginationTokens(1, 1)).toEqual([1]);
    expect(buildPaginationTokens(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(buildPaginationTokens(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('shows middle ellipsis when current is late', () => {
    // Current=10, Total=20 -> [1, ellipsis, 9, 10, 11, ellipsis, 20]
    expect(buildPaginationTokens(10, 20)).toEqual([1, 'ellipsis', 9, 10, 11, 'ellipsis', 20]);
  });

  it('shows only trailing ellipsis when current is early', () => {
    // Current=2, Total=20 -> [1, 2, 3, ellipsis, 20]
    expect(buildPaginationTokens(2, 20)).toEqual([1, 2, 3, 'ellipsis', 20]);
  });

  it('shows only leading ellipsis when current is near end', () => {
    // Current=19, Total=20 -> [1, ellipsis, 18, 19, 20]
    expect(buildPaginationTokens(19, 20)).toEqual([1, 'ellipsis', 18, 19, 20]);
  });

  it('handles boundary case where ellipsis is close to first page', () => {
    // Current=4, Total=20 -> [1, 'ellipsis', 3, 4, 5, 'ellipsis', 20]
    // Because start = 3, and 3 > 2.
    expect(buildPaginationTokens(4, 20)).toEqual([1, 'ellipsis', 3, 4, 5, 'ellipsis', 20]);
  });

  it('handles boundary case where ellipsis is close to last page', () => {
    // Current=17, Total=20 -> [1, 'ellipsis', 16, 17, 18, 'ellipsis', 20]
    expect(buildPaginationTokens(17, 20)).toEqual([1, 'ellipsis', 16, 17, 18, 'ellipsis', 20]);
  });
});
