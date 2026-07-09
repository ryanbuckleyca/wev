'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import FormContainer from './FormContainer';
import FormField from './FormField';
import FormTextarea from './FormTextarea';
import FormLabel from './FormLabel';
import ErrorMessage from './ErrorMessage';
import Button from './Button';
import ValuesSelector from './profile/values/ValuesSelector';
import { generateSlug } from '@/lib/slug';
import { createOrganization, updateOrganization } from '@/lib/organizations/actions';
import { translateOrgActionError } from '@/lib/organizations/action-errors';
import { mapClientValidationError } from '@/lib/organizations/org-admin-form';
import {
  MAX_ORG_DESCRIPTION_LENGTH,
  MAX_ORG_MISSION_LENGTH,
  MAX_ORG_VALUES,
  ORG_TYPES,
} from '@/lib/organizations/constants';
import { orgTypeI18nKey } from '@/lib/organizations/utils';
import { validateOrgInput, normalizeOrgType, type OrgFormInput } from '@/lib/organizations/validate';
import { buildWorkValues } from '@/lib/values';
import type { OrgRecord } from '@/lib/organizations/types';
import notify from '@/lib/toast';
import { cn } from '@/lib/utils';

interface OrgAdminFormProps {
  initialValues?: Partial<OrgRecord>;
  locale: string;
}

type FormErrors = Partial<Record<string, string>> & { general?: string };

function parseOrgId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export default function OrgAdminForm({ initialValues, locale }: OrgAdminFormProps) {
  const t = useTranslations('admin.organizations');
  const tValues = useTranslations('values');
  const router = useRouter();

  const isEditMode = Boolean(initialValues?.id);
  const appLocale = (locale === 'fr' ? 'fr' : 'en') as 'en' | 'fr';

  const [name, setName] = useState(initialValues?.name || '');
  const [slug, setSlug] = useState(initialValues?.slug || '');
  const [description, setDescription] = useState(initialValues?.description || '');
  const [missionStatement, setMissionStatement] = useState(
    initialValues?.mission_statement || '',
  );
  const [website, setWebsite] = useState(initialValues?.website || '');
  const [location, setLocation] = useState(initialValues?.location || '');
  const [type, setType] = useState(() => normalizeOrgType(initialValues?.type) || '');
  const [isSse, setIsSse] = useState(initialValues?.is_sse ?? false);
  const [valuesList, setValuesList] = useState<string[]>(initialValues?.values_list ?? []);
  const [valueCutoff, setValueCutoff] = useState(valuesList.length);

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(Boolean(initialValues?.slug));

  const workValues = useMemo(() => {
    const tEn = (key: string, opts?: { defaultValue: string }) =>
      tValues(key, opts as { defaultValue?: string });
    const tFr = tEn;
    return buildWorkValues(tEn, tFr);
  }, [tValues]);

  useEffect(() => {
    if (!isEditMode && name && !slugManuallyEdited) {
      setSlug(generateSlug(name));
    }
  }, [name, isEditMode, slugManuallyEdited]);

  const buildFormInput = useCallback(
    (): OrgFormInput => ({
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || null,
      mission_statement: missionStatement.trim() || null,
      website: website.trim() || null,
      location: location.trim() || null,
      type: type || null,
      is_sse: isSse,
      values_list: valuesList,
    }),
    [
      name,
      slug,
      description,
      missionStatement,
      website,
      location,
      type,
      isSse,
      valuesList,
    ],
  );

  const handleValueToggle = (id: string) => {
    setValuesList((prev) => {
      if (prev.includes(id)) return prev.filter((value) => value !== id);
      if (prev.length >= MAX_ORG_VALUES) return prev;
      return [...prev, id];
    });
  };

  const handleValueRemove = (id: string) => {
    setValuesList((prev) => {
      const next = prev.filter((value) => value !== id);
      setValueCutoff((cutoff) => Math.min(cutoff, next.length));
      return next;
    });
  };

  const handleValueReorder = (from: number, to: number) => {
    setValuesList((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const formInput = buildFormInput();
    const validationError = validateOrgInput(formInput);
    if (validationError) {
      setErrors({ [validationError.field]: mapClientValidationError(t, validationError) });
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      const orgId = parseOrgId(String(initialValues?.id));
      const result = isEditMode
        ? await updateOrganization(orgId!, formInput)
        : await createOrganization(formInput);

      if (!result.ok) {
        if (result.field && result.error) {
          const { field, message } = translateOrgActionError(t, result, t('errors.saveFailed'));
          setErrors({ [field!]: message });
          return;
        }

        if (result.error === 'unauthorized') {
          notify.error(t('errors.unauthorized'));
          router.push(`/${locale}/login`);
          return;
        }

        const { message } = translateOrgActionError(t, result, t('errors.saveFailed'));
        setErrors({ general: message });
        return;
      }

      notify.success(isEditMode ? t('updateSuccess') : t('createSuccess'));
      router.push(`/${locale}/admin/organizations`);
      router.refresh();
    } catch (err) {
      console.error('Form submission error:', err);
      setErrors({ general: t('errors.saveFailed') });
    } finally {
      setIsSubmitting(false);
    }
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
        value={name}
        onChange={setName}
        placeholder={t('placeholders.name')}
        required
        error={errors.name}
        htmlFor="org-name"
        fullWidth
        disabled={isSubmitting}
      />

      <div className="space-y-2">
        <FormLabel htmlFor="org-slug" required>
          {t('fields.slug')}
        </FormLabel>
        <input
          id="org-slug"
          type="text"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugManuallyEdited(true);
          }}
          placeholder={t('placeholders.slug')}
          required
          disabled={isSubmitting}
          className={cn(
            'w-full px-4 py-3 text-[13px] font-medium border border-border rounded-wev-btn',
            'bg-background text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all',
          )}
        />
        {!slugManuallyEdited && name && (
          <p className="text-xs text-muted-foreground">{t('slugPreview', { slug })}</p>
        )}
        {errors.slug && <ErrorMessage>{errors.slug}</ErrorMessage>}
      </div>

      <FormTextarea
        label={t('fields.description')}
        value={description}
        onChange={setDescription}
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
        value={missionStatement}
        onChange={setMissionStatement}
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
        value={website}
        onChange={setWebsite}
        placeholder={t('placeholders.website')}
        error={errors.website}
        htmlFor="org-website"
        fullWidth
        disabled={isSubmitting}
      />

      <FormField
        label={t('fields.location')}
        value={location}
        onChange={setLocation}
        placeholder={t('placeholders.location')}
        htmlFor="org-location"
        fullWidth
        disabled={isSubmitting}
      />

      <div className="space-y-2">
        <FormLabel htmlFor="org-type">{t('fields.type')}</FormLabel>
        <select
          id="org-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          disabled={isSubmitting}
          className={cn(
            'w-full px-4 py-3 text-[13px] font-medium border border-border rounded-wev-btn',
            'bg-background text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all',
          )}
        >
          <option value="">{t('placeholders.selectType')}</option>
          {ORG_TYPES.map((orgType) => (
            <option key={orgType} value={orgType}>
              {t(`types.${orgTypeI18nKey(orgType)}`)}
            </option>
          ))}
        </select>
        {errors.type && <ErrorMessage>{errors.type}</ErrorMessage>}
      </div>

      <div className="space-y-2">
        <FormLabel>{t('fields.values')}</FormLabel>
        <p className="text-xs text-muted-foreground">{t('valuesHint', { max: MAX_ORG_VALUES })}</p>
        <ValuesSelector
          values={workValues}
          selectedValues={valuesList}
          valueCutoff={valueCutoff}
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
          checked={isSse}
          onChange={(e) => setIsSse(e.target.checked)}
          disabled={isSubmitting}
          className="w-4 h-4 border-border rounded focus:ring-2 focus:ring-ring"
        />
        <FormLabel htmlFor="org-is-sse" className="mb-0">
          {t('fields.isSse')}
        </FormLabel>
      </div>

      <div className="flex gap-4 pt-4">
        <Button type="submit" disabled={isSubmitting} variant="primary">
          {isSubmitting
            ? t('saving')
            : isEditMode
              ? t('actions.update')
              : t('actions.create')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push(`/${locale}/admin/organizations`)}
          disabled={isSubmitting}
        >
          {t('actions.cancel')}
        </Button>
      </div>
    </FormContainer>
  );
}
