import type { PostgrestError } from '@supabase/supabase-js';
import type { ActionError } from './actions';
import type { OrgValidationError } from './validate';

const VALIDATION_ERROR_KEYS: Record<string, string> = {
  name_required: 'errors.nameRequired',
  invalid_slug: 'errors.slugRequired',
  slug_invalid: 'errors.slugInvalid',
  website_invalid: 'errors.websiteInvalid',
  description_too_long: 'errors.descriptionTooLong',
  mission_too_long: 'errors.missionTooLong',
  invalid_type: 'errors.invalidType',
  invalid_values: 'errors.invalidValues',
  too_many_values: 'errors.tooManyValues',
};

const ACTION_ERROR_KEYS: Record<string, string> = {
  slug_taken: 'errors.slug_taken',
  organization_exists: 'errors.organization_exists',
  unauthorized: 'errors.unauthorized',
  not_found: 'errors.not_found',
  database_error: 'errors.database_error',
  slug_invalid: 'errors.slug_invalid',
};

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

function translateErrorCode(
  t: (key: string) => string,
  code: string,
  keyMap: Record<string, string>,
  fallback: string,
): string {
  const key = keyMap[code] ?? `errors.${code}`;
  const message = t(key);
  return message !== key ? message : fallback;
}

export function mapClientValidationError(
  t: (key: string) => string,
  error: OrgValidationError,
): string {
  return translateErrorCode(t, error.error, VALIDATION_ERROR_KEYS, t('errors.saveFailed'));
}

export function translateOrgActionError(
  t: (key: string) => string,
  result: { error: string; field?: string },
  fallback: string,
): { field?: string; message: string } {
  return {
    field: result.field,
    message: translateErrorCode(t, result.error, ACTION_ERROR_KEYS, fallback),
  };
}
