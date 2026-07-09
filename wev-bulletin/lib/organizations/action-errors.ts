import type { PostgrestError } from '@supabase/supabase-js';
import type { ActionError } from './actions';

export function mapUniqueViolation(error: PostgrestError): ActionError | null {
  if (error.code !== '23505') return null;

  const target = `${error.details ?? ''} ${error.message ?? ''}`.toLowerCase();
  if (target.includes('organizations_slug_key') || target.includes('(slug)')) {
    return { ok: false, error: 'slug_taken', field: 'slug' };
  }
  if (target.includes('organizations_identity_key') || target.includes('identity')) {
    return { ok: false, error: 'organization_exists', field: 'name' };
  }
  return { ok: false, error: 'database_error' };
}

export function translateOrgActionError(
  t: (key: string) => string,
  result: { error: string; field?: string },
  fallback: string,
): { field?: string; message: string } {
  const errorKey = `errors.${result.error}`;
  const message = t(errorKey);
  return {
    field: result.field,
    message: message !== errorKey ? message : fallback,
  };
}
