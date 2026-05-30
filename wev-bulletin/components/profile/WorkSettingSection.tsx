'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { WORK_TYPES, type WorkType } from '@/lib/work-types';
import FormLabel from '@/components/FormLabel';
import LocationAutocomplete from '@/components/profile/LocationAutocomplete';
import Alert from '@/components/ui/Alert';
import type { LocationState } from '@/lib/hooks/useProfileForm';

interface WorkSettingSectionProps {
  workTypes: WorkType[];
  location: LocationState | null;
  onWorkTypeToggle: (workType: WorkType) => void;
  onLocationChange: (location: LocationState | null) => void;
  hasLocationValue: boolean;
}

export default function WorkSettingSection({
  workTypes,
  location,
  onWorkTypeToggle,
  onLocationChange,
  hasLocationValue,
}: WorkSettingSectionProps) {
  const t = useTranslations();

  const workTypeLabels = useMemo<Record<WorkType, string>>(
    () => ({
      remote: t('filters.workType.remote'),
      hybrid: t('filters.workType.hybrid'),
      office: t('filters.workType.office'),
    }),
    [t],
  );

  return (
    <div>
      {/* Work Type Preference */}
      <div>
        <FormLabel>{t('profile.workType')}</FormLabel>
        <p className="text-xs text-muted-foreground mb-2">{t('profile.workTypeHint')}</p>
        <div className="flex gap-2 flex-wrap">
          {WORK_TYPES.map((workType) => {
            const isSelected = workTypes.includes(workType);
            return (
              <button
                key={workType}
                type="button"
                onClick={() => onWorkTypeToggle(workType)}
                className={`px-4 py-2 rounded-wev-btn text-sm font-medium transition-colors ${
                  isSelected
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-gray-50 text-gray-700 border border-gray-100 dark:bg-zinc-800 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-700'
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
        <FormLabel htmlFor="location-autocomplete">{t('profile.location')}</FormLabel>
        <LocationAutocomplete
          inputId="location-autocomplete"
          value={
            location
              ? {
                  lat: location.lat,
                  lng: location.lng,
                  display_name: location.display_name,
                }
              : null
          }
          onChange={onLocationChange}
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
  );
}
