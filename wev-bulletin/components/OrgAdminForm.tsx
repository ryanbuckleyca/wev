'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import FormContainer from './FormContainer';
import FormField from './FormField';
import FormTextarea from './FormTextarea';
import FormLabel from './FormLabel';
import ErrorMessage from './ErrorMessage';
import Button from './Button';
import { generateSlug } from '@/lib/slug';
import { createOrganization, updateOrganization } from '@/lib/organizations/actions';
import type { OrgRecord } from '@/lib/organizations/types';
import { toast } from 'sonner';

interface OrgAdminFormProps {
  initialValues?: Partial<OrgRecord>;
  locale: string;
}

interface FormErrors {
  name?: string;
  slug?: string;
  website?: string;
  general?: string;
}

const ORG_TYPES = [
  'nonprofit',
  'cooperative',
  'social_enterprise',
  'government',
  'union',
  'other',
] as const;

export default function OrgAdminForm({ initialValues, locale }: OrgAdminFormProps) {
  const t = useTranslations('admin.organizations');
  const tCommon = useTranslations('common');
  const router = useRouter();

  const isEditMode = Boolean(initialValues?.id);

  // Form state
  const [name, setName] = useState(initialValues?.name || '');
  const [slug, setSlug] = useState(initialValues?.slug || '');
  const [description, setDescription] = useState(initialValues?.description || '');
  const [missionStatement, setMissionStatement] = useState(
    initialValues?.mission_statement || '',
  );
  const [website, setWebsite] = useState(initialValues?.website || '');
  const [location, setLocation] = useState(initialValues?.location || '');
  const [type, setType] = useState<string>(initialValues?.type || '');
  const [isSse, setIsSse] = useState(initialValues?.is_sse ?? false);
  const [values, setValues] = useState(initialValues?.values || '');

  // UI state
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(Boolean(initialValues?.slug));

  // Auto-generate slug from name as user types (only in create mode)
  useEffect(() => {
    if (!isEditMode && name && !slugManuallyEdited) {
      setSlug(generateSlug(name));
    }
  }, [name, isEditMode, slugManuallyEdited]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!name.trim()) {
      newErrors.name = t('errors.nameRequired');
    }

    if (!slug.trim()) {
      newErrors.slug = t('errors.slugRequired');
    } else if (!/^[a-z0-9-]+$/.test(slug)) {
      newErrors.slug = t('errors.slugInvalid');
    }

    if (website && website.trim() && !website.startsWith('http')) {
      newErrors.website = t('errors.websiteInvalid');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      const formData = {
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || null,
        mission_statement: missionStatement.trim() || null,
        website: website.trim() || null,
        location: location.trim() || null,
        type: type || null,
        is_sse: isSse,
        values: values.trim() || null,
      };

      const result = isEditMode
        ? await updateOrganization(initialValues!.id!, formData)
        : await createOrganization(formData);

      if (!result.ok) {
        // Handle field-specific errors
        if (result.field && result.error) {
          const errorKey = `errors.${result.error}`;
          const errorMessage = t(errorKey);
          setErrors({ [result.field]: errorMessage !== errorKey ? errorMessage : result.error });
          return;
        }

        // Handle general errors
        if (result.error === 'unauthorized') {
          toast.error(t('errors.unauthorized'));
          router.push(`/${locale}/login`);
          return;
        }

        const errorKey = `errors.${result.error}`;
        const errorMessage = t(errorKey);
        setErrors({ general: errorMessage !== errorKey ? errorMessage : t('errors.saveFailed') });
        return;
      }

      // Success
      toast.success(isEditMode ? t('updateSuccess') : t('createSuccess'));
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
          className="w-full px-4 py-3 text-[13px] font-medium border border-border rounded-wev-btn bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all"
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
        charLimit={500}
        fullWidth
      />

      <FormTextarea
        label={t('fields.missionStatement')}
        value={missionStatement}
        onChange={setMissionStatement}
        placeholder={t('placeholders.missionStatement')}
        htmlFor="org-mission"
        rows={3}
        charLimit={300}
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
      />

      <FormField
        label={t('fields.location')}
        value={location}
        onChange={setLocation}
        placeholder={t('placeholders.location')}
        htmlFor="org-location"
        fullWidth
      />

      <div className="space-y-2">
        <FormLabel htmlFor="org-type">{t('fields.type')}</FormLabel>
        <select
          id="org-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          disabled={isSubmitting}
          className="w-full px-4 py-3 text-[13px] font-medium border border-border rounded-wev-btn bg-background text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all"
        >
          <option value="">{t('placeholders.selectType')}</option>
          {ORG_TYPES.map((orgType) => (
            <option key={orgType} value={orgType}>
              {t(`types.${orgType}`)}
            </option>
          ))}
        </select>
      </div>

      <FormTextarea
        label={t('fields.values')}
        value={values}
        onChange={setValues}
        placeholder={t('placeholders.values')}
        htmlFor="org-values"
        rows={3}
        fullWidth
      />

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
        <Button type="submit" disabled={isSubmitting} tone="primary">
          {isSubmitting
            ? tCommon('saving')
            : isEditMode
              ? t('actions.update')
              : t('actions.create')}
        </Button>
        <Button
          type="button"
          tone="secondary"
          onClick={() => router.push(`/${locale}/admin/organizations`)}
          disabled={isSubmitting}
        >
          {tCommon('cancel')}
        </Button>
      </div>
    </FormContainer>
  );
}
