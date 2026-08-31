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
import OrgSectorSelect from './OrgSectorSelect';
import OrgLanguageSelect from './OrgLanguageSelect';
import OrgReviewActions from './admin/OrgReviewActions';
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
import {
  ORG_SKIP_REASON_IGNORED,
  findMissingOrgFields,
} from '@/lib/organizations/assessment-review';
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

  const orgIdForReview = parseOrgId(initialValues?.id);
  const skipReason = initialValues?.assessment_skip_reason ?? null;
  // Ignored orgs are parked on purpose, so they get no banner.
  const showReviewBanner = Boolean(skipReason) && skipReason !== ORG_SKIP_REASON_IGNORED;
  const skipReasonLabel =
    skipReason && t.has(`skipReasons.${skipReason}`)
      ? t(`skipReasons.${skipReason}`)
      : (skipReason ?? t('skipReasons.unknown'));

  // Recomputed from live form state so the checklist shrinks as fields are filled.
  const missingFields = findMissingOrgFields({
    sector_id: form.sectorId,
    type: form.type,
    description_en: form.descriptionEn,
    description_fr: form.descriptionFr,
    language: form.language,
    values_list: form.valuesList,
  });

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

      {showReviewBanner && orgIdForReview !== null && (
        <div className="p-4 rounded bg-warning/10 text-foreground border border-warning/30">
          <p className="font-medium">{t('review.banner', { reason: skipReasonLabel })}</p>
          {missingFields.length > 0 ? (
            <div className="mt-2 text-sm">
              <p className="text-muted-foreground">{t('review.missingIntro')}</p>
              <ul className="mt-1 list-disc list-inside text-muted-foreground">
                {missingFields.map((field) => (
                  <li key={field}>{t(`review.missingFields.${field}`)}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{t('review.missingNone')}</p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">{t('review.bannerHint')}</p>
          <div className="mt-3">
            <OrgReviewActions
              orgId={orgIdForReview}
              currentReason={skipReason}
              locale={locale}
              disabled={isSubmitting || isDeleting}
            />
          </div>
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
        label={t('fields.descriptionEn')}
        value={form.descriptionEn}
        onChange={form.setDescriptionEn}
        placeholder={t('placeholders.descriptionEn')}
        htmlFor="org-description-en"
        rows={4}
        charLimit={MAX_ORG_DESCRIPTION_LENGTH}
        error={errors.description_en || errors.description}
        disabled={isSubmitting}
        fullWidth
      />

      <FormTextarea
        label={t('fields.descriptionFr')}
        value={form.descriptionFr}
        onChange={form.setDescriptionFr}
        placeholder={t('placeholders.descriptionFr')}
        htmlFor="org-description-fr"
        rows={4}
        charLimit={MAX_ORG_DESCRIPTION_LENGTH}
        error={errors.description_fr}
        disabled={isSubmitting}
        fullWidth
      />

      <FormTextarea
        label={t('fields.missionStatementEn')}
        value={form.missionStatementEn}
        onChange={form.setMissionStatementEn}
        placeholder={t('placeholders.missionStatementEn')}
        htmlFor="org-mission-en"
        rows={3}
        charLimit={MAX_ORG_MISSION_LENGTH}
        error={errors.mission_statement_en || errors.mission_statement}
        disabled={isSubmitting}
        fullWidth
      />

      <FormTextarea
        label={t('fields.missionStatementFr')}
        value={form.missionStatementFr}
        onChange={form.setMissionStatementFr}
        placeholder={t('placeholders.missionStatementFr')}
        htmlFor="org-mission-fr"
        rows={3}
        charLimit={MAX_ORG_MISSION_LENGTH}
        error={errors.mission_statement_fr}
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

      <OrgSectorSelect
        value={form.sectorId}
        onChange={form.setSectorId}
        label={t('fields.sector')}
        placeholder={t('placeholders.selectSector')}
        error={errors.sector_id}
        disabled={isSubmitting}
      />

      <OrgLanguageSelect
        value={form.language}
        onChange={form.setLanguage}
        label={t('fields.language')}
        placeholder={t('placeholders.selectLanguage')}
        hint={t('hints.language')}
        error={errors.language}
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
