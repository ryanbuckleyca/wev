import { describe, expect, it } from 'vitest';
import { parseCvImportMetadata } from './types';

describe('cv types', () => {
  describe('parseCvImportMetadata', () => {
    it('returns parsed metadata for a valid payload', () => {
      expect(
        parseCvImportMetadata({
          filename: 'resume.pdf',
          imported_at: '2023-10-01T12:00:00.000Z',
          source: 'cv_upload',
          locale: 'en',
        }),
      ).toEqual({
        filename: 'resume.pdf',
        imported_at: '2023-10-01T12:00:00.000Z',
        source: 'cv_upload',
        locale: 'en',
      });
    });

    it('returns null for malformed metadata', () => {
      expect(
        parseCvImportMetadata({
          filename: '',
          imported_at: 'not-a-date',
          source: 'other',
          locale: 'es',
        }),
      ).toBeNull();
    });
  });
});
