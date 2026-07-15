import { describe, it, expect } from 'vitest';
import type { PostgrestError } from '@supabase/supabase-js';
import { mapUniqueViolation } from './action-errors';

function makeUniqueError(details: string, message: string): PostgrestError {
  return {
    code: '23505',
    details,
    message,
    hint: '',
    name: 'PostgrestError',
  } as PostgrestError;
}

describe('mapUniqueViolation', () => {
  it('maps slug conflicts', () => {
    expect(
      mapUniqueViolation(
        makeUniqueError(
          'Key (slug)=(acme) already exists.',
          'duplicate key value violates unique constraint "organizations_slug_key"',
        ),
      ),
    ).toEqual({ ok: false, error: 'slug_taken', field: 'slug' });
  });

  it('maps identity conflicts', () => {
    expect(
      mapUniqueViolation(
        makeUniqueError(
          'Key (name, location)=(Acme, Montreal) already exists.',
          'duplicate key value violates unique constraint "organizations_identity_key"',
        ),
      ),
    ).toEqual({ ok: false, error: 'organization_exists', field: 'name' });
  });

  it('returns null for non-unique errors', () => {
    expect(
      mapUniqueViolation({
        code: '42P01',
        details: '',
        message: 'relation missing',
        hint: '',
        name: 'PostgrestError',
      } as PostgrestError),
    ).toBeNull();
  });
});
