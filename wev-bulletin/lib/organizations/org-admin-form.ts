import type { OrgValidationError } from './validate';

const CLIENT_ERROR_KEYS: Record<string, string> = {
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

export function mapClientValidationError(
  t: (key: string) => string,
  error: OrgValidationError,
): string {
  const key = CLIENT_ERROR_KEYS[error.error] ?? `errors.${error.error}`;
  const message = t(key);
  if (message !== key) return message;
  if (CLIENT_ERROR_KEYS[error.error]) return key;
  return t('errors.saveFailed');
}
