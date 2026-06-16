'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';
import { useProfileForm, MAX_PROFILE_SKILLS, MAX_PROFILE_VALUES } from '@/lib/hooks/useProfileForm';
import SkillsSelector from '@/components/profile/skills/SkillsSelector';
import ValuesSelector from '@/components/profile/values/ValuesSelector';
import WorkSettingSection from '@/components/profile/WorkSettingSection';
import CompetencySection from '@/components/profile/CompetencySection';
import LoadingState from '@/components/LoadingState';
import FormContainer from '@/components/FormContainer';
import FormField from '@/components/FormField';
import FormTextarea from '@/components/FormTextarea';
import ErrorBox from '@/components/ErrorBox';
import PageLayout from '@/components/PageLayout';
import CardLayout from '@/components/CardLayout';
import Heading from '@/components/Heading';
import Button from '@/components/Button';
import LinkButton from '@/components/LinkButton';
import CVImportButton from '@/components/profile/cv/CVImportButton';
import FormLabel from '@/components/FormLabel';
import { SUPPORTED_LANGUAGES } from '@/lib/languages';
import TogglePillGroup from '@/components/profile/TogglePillGroup';

export default function ProfilePage() {
  const t = useTranslations();
  const locale = useLocale() as 'en' | 'fr';
  const { user, loading } = useRequireAuth();

  const {
    profileLoading,
    profileError,
    formData,
    setFormData,
    selectedSkills,
    skillCutoff,
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
    handleApplyCvImport,
    handleWorkTypeToggle,
    handleLanguageToggle,
  } = useProfileForm(locale);

  const hasLocationValue = selectedValues.includes('Location');

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

            <WorkSettingSection
              workTypes={formData.work_types}
              location={formData.location}
              onWorkTypeToggle={handleWorkTypeToggle}
              onLocationChange={(val) => setFormData({ ...formData, location: val })}
              hasLocationValue={hasLocationValue}
            />

            {/* Language Preference */}
            <div className="space-y-2">
              <fieldset className="space-y-2">
                <FormLabel as="legend">{t('profile.languagePreference')}</FormLabel>
                <p className="helper-text">{t('profile.languagePreferenceHint')}</p>
                <TogglePillGroup
                  options={SUPPORTED_LANGUAGES.map((lang) => ({
                    value: lang,
                    label: t(`filters.language.${lang}`),
                  }))}
                  selectedValues={formData.preferred_languages}
                  onToggle={handleLanguageToggle}
                />
              </fieldset>
            </div>

            {/* Bio */}
            <FormTextarea
              htmlFor="bio"
              label={t('profile.bio')}
              value={formData.bio}
              onChange={(value) => setFormData({ ...formData, bio: value })}
              placeholder={t('profile.bioPlaceholder')}
              rows={4}
              showCount={false}
            />

            {/* Competencies — groups CV import, Skills, and Work Values */}
            <div className="space-y-4">
              <div className="space-y-2">
                <FormLabel>{t('profile.competencies')}</FormLabel>
                <p className="helper-text">{t('profile.competenciesHint')}</p>
              </div>

              <CVImportButton
                locale={locale}
                cvImport={formData.cv_import ?? null}
                isSaving={isSaving}
                onConfirmImport={handleApplyCvImport}
              />

              {/* Skills */}
              <CompetencySection
                label={t('profile.skills')}
                count={selectedSkills.length}
                max={MAX_PROFILE_SKILLS}
                overLimitWarning={t('profile.skillsSoftLimitWarning', { max: MAX_PROFILE_SKILLS })}
              >
                <SkillsSelector
                  selectedSkills={selectedSkills}
                  skillCutoff={skillCutoff}
                  onToggle={handleSkillToggle}
                  onReorder={handleSkillReorder}
                  onRemove={handleSkillRemove}
                  locale={locale}
                />
              </CompetencySection>

              {/* Work Values */}
              <CompetencySection
                label={t('profile.workValues')}
                count={selectedValues.length}
                max={MAX_PROFILE_VALUES}
                overLimitWarning={t('profile.valuesSoftLimitWarning', { max: MAX_PROFILE_VALUES })}
              >
                <ValuesSelector
                  values={workValues}
                  selectedValues={selectedValues}
                  valueCutoff={valueCutoff}
                  onToggle={handleValueToggle}
                  onReorder={handleValueReorder}
                  onRemove={handleValueRemove}
                  locale={locale}
                />
              </CompetencySection>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-6 border-t border-border">
            <div className="flex justify-between gap-3">
              <LinkButton href="/" variant="secondary">
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
