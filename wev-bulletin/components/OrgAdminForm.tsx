'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import FormContainer from './FormContainer';
import FormField from './FormField';
import FormTextarea from './FormTextarea';
import FormLabel from './FormLabel';
import ErrorMessage from './ErrorMessage';
import Button from './Button';
import ValuesSelector from './profile/values/ValuesSelector';
import LocationAutocomplete from './profile/LocationAutocomplete';
import OrgSlugField from './OrgSlugField';
import OrgTypeSelect from './OrgTypeSelect';
import {
  createOrganization,
  updateOrganization,
  deleteOrganization,
  getOrganizationActiveJobCount,
  type ActionResult,
} from '@/lib/organizations/actions';
import {
  mapClientValidationError,
  translateOrgActionError,
} from '@/lib/organizations/action-errors';
import {
  MAX_ORG_DESCRIPTION_LENGTH,
  MAX_ORG_MISSION_LENGTH,
  MAX_ORG_VALUES,
} from '@/lib/organizations/constants';
import { getOrganizationTypeLabel } from '@/lib/organizations/org-type';
import { parseOrgId } from '@/lib/organizations/parse-org-id';
import { useOrgAdminFormState } from '@/lib/organizations/use-org-admin-form-state';
import { validateOrgInput } from '@/lib/organizations/validate';
import { buildWorkValues } from '@/lib/values';
import type { OrgRecord } from '@/lib/organizations/types';
import notify from '@/lib/toast';

interface OrgAdminFormProps {
  initialValues?: Partial<OrgRecord>;
  locale: string;
}

type FormErrors = Partial<Record<string, string>> & { general?: string };

function applyActionError(
  t: (key: string) => string,
  result: { ok: false; error: string; field?: string },
  fallback: string,
): FormErrors {
  if (result.field) {
    const { field, message } = translateOrgActionError(t, result, fallback);
    return { [field!]: message };
  }
  const { message } = translateOrgActionError(t, result, fallback);
  return { general: message };
}

export default function OrgAdminForm({ initialValues, locale }: OrgAdminFormProps) {
  const t = useTranslations('admin.organizations');
  const tOrgs = useTranslations('organizations');
  const tValues = useTranslations('values');
  const router = useRouter();

  const form = useOrgAdminFormState(initialValues);
  const appLocale = (locale === 'fr' ? 'fr' : 'en') as 'en' | 'fr';

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const workValues = useMemo(() => {
    const tEn = (key: string, opts?: { defaultValue: string }) =>
      tValues(key, opts as { defaultValue?: string });
    return buildWorkValues(tEn, tEn);
  }, [tValues]);

  const orgTypeLabel = useCallback(
    (orgType: string) => getOrganizationTypeLabel(orgType, tOrgs) ?? orgType,
    [tOrgs],
  );

  const handleValueToggle = (id: string) => {
    form.setValuesList((prev) => {
      if (prev.includes(id)) return prev.filter((value) => value !== id);
      if (prev.length >= MAX_ORG_VALUES) return prev;
      return [...prev, id];
    });
  };

  const handleValueRemove = (id: string) => {
    form.setValuesList((prev) => prev.filter((value) => value !== id));
  };

  const handleValueReorder = (from: number, to: number) => {
    form.setValuesList((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const runSubmit = async (submit: () => Promise<ActionResult>, successMessage: string) => {
    setIsSubmitting(true);
    setErrors({});

    try {
      const result = await submit();
      if (!result.ok) {
        if (result.error === 'unauthorized') {
          notify.error(t('errors.unauthorized'));
          router.push(`/${locale}/login`);
          return;
        }
        setErrors(applyActionError(t, result, t('errors.saveFailed')));
        return;
      }

      notify.success(successMessage);
      router.push(`/${locale}/organizations/${result.org.slug}`);
      router.refresh();
      return;
    } catch (err) {
      console.error('Form submission error:', err);
      setErrors({ general: t('errors.saveFailed') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    const orgId = parseOrgId(initialValues?.id);
    if (!orgId) {
      setErrors({ general: t('errors.not_found') });
      return;
    }

    const jobCount = await getOrganizationActiveJobCount(orgId);
    const confirmed = window.confirm(
      t('deleteConfirm', { name: form.name || t('fields.name'), count: jobCount }),
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setErrors({});

    try {
      const result = await deleteOrganization(orgId);
      if (!result.ok) {
        if (result.error === 'unauthorized') {
          notify.error(t('errors.unauthorized'));
          router.push(`/${locale}/login`);
          return;
        }
        setErrors(applyActionError(t, result, t('errors.deleteFailed')));
        return;
      }

      notify.success(t('deleteSuccess'));
      router.push(`/${locale}/admin/organizations`);
      router.refresh();
      return;
    } catch (err) {
      console.error('Organization delete error:', err);
      setErrors({ general: t('errors.deleteFailed') });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const formInput = form.buildFormInput();
    const validationError = validateOrgInput(formInput);
    if (validationError) {
      setErrors({ [validationError.field]: mapClientValidationError(t, validationError) });
      return;
    }

    if (form.isEditMode) {
      const orgId = parseOrgId(initialValues?.id);
      if (!orgId) {
        setErrors({ general: t('errors.not_found') });
        return;
      }
      await runSubmit(() => updateOrganization(orgId, formInput), t('updateSuccess'));
      return;
    }

    await runSubmit(() => createOrganization(formInput), t('createSuccess'));
  };

  return (
    <FormContainer onSubmit={handleSubmit}>
      {errors.general && (
        <div className="p-4 rounded bg-destructive/10 text-destructive border border-destructive/20">
          {errors.general}
        </div>
      )}

      <FormField
        label={t('fields.name')}
        value={form.name}
        onChange={form.setName}
        placeholder={t('placeholders.name')}
        required
        error={errors.name}
        htmlFor="org-name"
        fullWidth
        disabled={isSubmitting}
      />

      <OrgSlugField
        slug={form.slug}
        onSlugChange={form.setSlug}
        onManualEdit={() => form.setSlugManuallyEdited(true)}
        label={t('fields.slug')}
        placeholder={t('placeholders.slug')}
        preview={
          !form.slugManuallyEdited && form.name ? t('slugPreview', { slug: form.slug }) : undefined
        }
        error={errors.slug}
        disabled={isSubmitting}
      />

      <FormTextarea
        label={t('fields.description')}
        value={form.description}
        onChange={form.setDescription}
        placeholder={t('placeholders.description')}
        htmlFor="org-description"
        rows={4}
        charLimit={MAX_ORG_DESCRIPTION_LENGTH}
        error={errors.description}
        disabled={isSubmitting}
        fullWidth
      />

      <FormTextarea
        label={t('fields.missionStatement')}
        value={form.missionStatement}
        onChange={form.setMissionStatement}
        placeholder={t('placeholders.missionStatement')}
        htmlFor="org-mission"
        rows={3}
        charLimit={MAX_ORG_MISSION_LENGTH}
        error={errors.mission_statement}
        disabled={isSubmitting}
        fullWidth
      />

      <FormField
        label={t('fields.website')}
        value={form.website}
        onChange={form.setWebsite}
        placeholder={t('placeholders.website')}
        error={errors.website}
        htmlFor="org-website"
        fullWidth
        disabled={isSubmitting}
      />

      <div className="space-y-2">
        <FormLabel htmlFor="org-location">{t('fields.location')}</FormLabel>
        <LocationAutocomplete
          inputId="org-location"
          value={
            form.location
              ? {
                  lat: form.location.lat,
                  lng: form.location.lng,
                  display_name: form.location.display_name,
                }
              : null
          }
          onChange={(value) => form.setLocationSelection(value, value != null)}
          placeholder={t('placeholders.location')}
          hint={t('locationHint')}
          error={errors.location}
        />
      </div>

      <OrgTypeSelect
        value={form.type}
        onChange={form.setType}
        label={t('fields.type')}
        placeholder={t('placeholders.selectType')}
        typeLabel={orgTypeLabel}
        error={errors.type}
        disabled={isSubmitting}
      />

      <div className="space-y-2">
        <FormLabel>{t('fields.values')}</FormLabel>
        <p className="text-xs text-muted-foreground">{t('valuesHint', { max: MAX_ORG_VALUES })}</p>
        <ValuesSelector
          values={workValues}
          selectedValues={form.valuesList}
          valueCutoff={form.valueCutoff}
          onToggle={handleValueToggle}
          onReorder={handleValueReorder}
          onRemove={handleValueRemove}
          locale={appLocale}
        />
        {errors.values_list && <ErrorMessage>{errors.values_list}</ErrorMessage>}
      </div>

      <div className="flex items-center gap-3">
        <input
          id="org-is-sse"
          type="checkbox"
          checked={form.isSse}
          onChange={(e) => form.setIsSse(e.target.checked)}
          disabled={isSubmitting}
          className="w-4 h-4 border-border rounded focus:ring-2 focus:ring-ring"
        />
        <FormLabel htmlFor="org-is-sse" className="mb-0">
          {t('fields.isSse')}
        </FormLabel>
      </div>

      <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={isSubmitting || isDeleting} variant="primary">
            {isSubmitting
              ? t('saving')
              : form.isEditMode
                ? t('actions.update')
                : t('actions.create')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push(`/${locale}/admin/organizations`)}
            disabled={isSubmitting || isDeleting}
          >
            {t('actions.cancel')}
          </Button>
        </div>
        {form.isEditMode && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleDelete()}
            disabled={isSubmitting || isDeleting}
            className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            {isDeleting ? t('deleting') : t('actions.delete')}
          </Button>
        )}
      </div>
    </FormContainer>
  );
}
