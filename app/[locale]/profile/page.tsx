'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';
import {
  useProfileForm,
  MAX_PROFILE_SKILLS,
  MAX_PROFILE_VALUES,
} from '@/lib/hooks/useProfileForm';
import { WORK_TYPES, type WorkType } from '@/lib/work-types';
import SkillsSelector from '@/components/profile/skills/SkillsSelector';
import ValuesSelector from '@/components/profile/values/ValuesSelector';
import LocationAutocomplete from '@/components/profile/LocationAutocomplete';
import LoadingState from '@/components/LoadingState';
import FormContainer from '@/components/FormContainer';
import FormField from '@/components/FormField';
import FormLabel from '@/components/FormLabel';
import FormTextarea from '@/components/FormTextarea';
import CountBadge from '@/components/CountBadge';
import ErrorBox from '@/components/ErrorBox';
import PageLayout from '@/components/PageLayout';
import CardLayout from '@/components/CardLayout';
import Heading from '@/components/Heading';
import Button from '@/components/Button';
import LinkButton from '@/components/LinkButton';
import Alert from '@/components/ui/Alert';

export default function ProfilePage() {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'fr';
  const { user, loading } = useRequireAuth();

  const {
    profile,
    profileLoading,
    profileError,
    formData,
    setFormData,
    selectedSkills,
    skillCutoff,
    allSkills,
    isLibraryLoading,
    handleSkillToggle,
    handleSkillReorder,
    handleSkillRemove,
    workValues,
    selectedValues,
    valueCutoff,
    handleValueToggle,
    handleValueReorder,
    handleValueRemove,
    isSaving,
    handleSaveProfile,
    handleWorkTypeToggle,
  } = useProfileForm(locale);

  const hasLocationValue = selectedValues.includes('Location');

  const workTypeLabels = useMemo<Record<WorkType, string>>(
    () => ({
      remote: t('filters.workType.remote'),
      hybrid: t('filters.workType.hybrid'),
      office: t('filters.workType.office'),
    }),
    [t],
  );

  if (loading || profileLoading) {
    return <LoadingState message={t('common.loading')} />;
  }

  if (!user) return null;

  return (
    <PageLayout maxWidth="md">
      <CardLayout>
        <Heading level={1} className="mb-6">
          {t('profile.title')}
        </Heading>

        {profileError && <ErrorBox>{profileError}</ErrorBox>}

        <FormContainer onSubmit={handleSaveProfile}>
          <div className="space-y-6">
            {/* Full Name */}
            <FormField
              label={t('profile.fullName')}
              type="text"
              value={formData.full_name}
              onChange={(value) => setFormData({ ...formData, full_name: value })}
              placeholder={t('profile.fullNamePlaceholder')}
              fullWidth
              htmlFor="full-name"
            />

            {/* Bio */}
            <div>
              <FormTextarea
                htmlFor="bio"
                label={t('profile.bio')}
                value={formData.bio}
                onChange={(value) => setFormData({ ...formData, bio: value })}
                placeholder={t('profile.bioPlaceholder')}
                rows={4}
                showCount={false}
              />
            </div>

            {/* Skills */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-sm font-semibold leading-none text-foreground">
                  {t('profile.skills')}
                </h2>
                <CountBadge count={selectedSkills.length} max={MAX_PROFILE_SKILLS} />
              </div>

              {selectedSkills.length > MAX_PROFILE_SKILLS && (
                <Alert variant="warning" className="mb-2">
                  {t('profile.skillsSoftLimitWarning', { max: MAX_PROFILE_SKILLS })}
                </Alert>
              )}

              <SkillsSelector
                allItems={allSkills}
                selectedSkills={selectedSkills}
                skillCutoff={skillCutoff}
                onToggle={handleSkillToggle}
                onReorder={handleSkillReorder}
                onRemove={handleSkillRemove}
                locale={locale}
                isLoading={isLibraryLoading}
              />
            </div>

            {/* Work Values */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-sm font-semibold leading-none text-foreground">
                  {t('profile.workValues')}
                </h2>
                <CountBadge count={selectedValues.length} max={MAX_PROFILE_VALUES} />
              </div>

              {selectedValues.length > MAX_PROFILE_VALUES && (
                <Alert variant="warning" className="mb-2">
                  {t('profile.valuesSoftLimitWarning', { max: MAX_PROFILE_VALUES })}
                </Alert>
              )}

              <ValuesSelector
                values={workValues}
                selectedValues={selectedValues}
                valueCutoff={valueCutoff}
                onToggle={handleValueToggle}
                onReorder={handleValueReorder}
                onRemove={handleValueRemove}
                locale={locale}
              />
            </div>

            {/* Location & Work Setting */}
            <div>
              <h2 className="text-sm font-semibold leading-none text-foreground mb-2">
                {t('profile.locationAndWorkSetting')}
              </h2>

              {/* Work Type Preference */}
              <div>
                <FormLabel>{t('profile.workType')}</FormLabel>
                <p className="text-xs text-muted-foreground mb-2">{t('profile.workTypeHint')}</p>
                <div className="flex gap-2 flex-wrap">
                  {WORK_TYPES.map((workType) => {
                    const isSelected = formData.work_types.includes(workType);
                    return (
                      <button
                        key={workType}
                        type="button"
                        onClick={() => handleWorkTypeToggle(workType)}
                        className={`px-4 py-2 rounded-wev-btn text-sm font-medium transition-colors ${
                          isSelected
                            ? 'bg-primary text-white shadow-sm'
                            : 'bg-gray-50 text-gray-700 border border-gray-100 hover:bg-gray-100'
                        }`}
                      >
                        {workTypeLabels[workType]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Location autocomplete */}
              <div className="mt-4">
                <FormLabel htmlFor="location-autocomplete">
                  {t('profile.location')}
                </FormLabel>
                <LocationAutocomplete
                  value={
                    formData.location
                      ? {
                          lat: formData.location.lat,
                          lng: formData.location.lng,
                          display_name: formData.location.display_name,
                        }
                      : null
                  }
                  onChange={(val) => setFormData({ ...formData, location: val })}
                  hint={t('profile.locationHint')}
                />
              </div>

              {/* Contextual callout when Location is a ranked value */}
              {hasLocationValue && (
                <Alert variant="info" className="mt-3">
                  {t('profile.locationPriorityCallout')}
                </Alert>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-6 border-t border-gray-100 dark:border-zinc-800">
            <div className="flex justify-between gap-3">
              <LinkButton href="/" variant="outline">
                {t('profile.backToJobs')}
              </LinkButton>
              <Button type="submit" disabled={isSaving} loading={isSaving}>
                {isSaving ? t('profile.saving') : t('profile.saveProfile')}
              </Button>
            </div>
          </div>
        </FormContainer>
      </CardLayout>
    </PageLayout>
  );
}
