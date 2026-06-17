import { describe, expect, it } from 'vitest';
import {
  LOCALE_AWARE_FTS_MIGRATION,
  isUndefinedColumnError,
  throwBulletinQueryError,
} from './fts-errors';

describe('fts-errors', () => {
  it('detects Postgres undefined-column errors', () => {
    expect(isUndefinedColumnError({ code: '42703' })).toBe(true);
    expect(isUndefinedColumnError({ code: '42P01' })).toBe(false);
    expect(isUndefinedColumnError(null)).toBe(false);
  });

  it('throws a migration-specific error for missing locale FTS columns during search', () => {
    expect(() =>
      throwBulletinQueryError(
        { code: '42703', message: 'column fts_en does not exist' },
        { searchQuery: 'engineer', searchColumn: 'fts_en' },
      ),
    ).toThrow(
      `Bulletin search requires locale-aware FTS columns on matched_jobs (missing: fts_en). Apply migration ${LOCALE_AWARE_FTS_MIGRATION} before deploying this version.`,
    );
  });

  it('preserves generic query errors when search is not involved', () => {
    expect(() => throwBulletinQueryError({ message: 'permission denied' })).toThrow(
      'permission denied',
    );
  });

  it('preserves generic undefined-column errors when search text is empty', () => {
    expect(() =>
      throwBulletinQueryError(
        { code: '42703', message: 'column foo does not exist' },
        { searchQuery: '   ', searchColumn: 'fts_en' },
      ),
    ).toThrow('column foo does not exist');
  });
});
