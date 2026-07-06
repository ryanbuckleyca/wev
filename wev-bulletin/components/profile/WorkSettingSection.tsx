'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { WORK_TYPES, type WorkType } from '@/lib/work-types';
import FormLabel from '@/components/FormLabel';
import LocationAutocomplete from '@/components/profile/LocationAutocomplete';
import TogglePillGroup from '@/components/profile/TogglePillGroup';
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
      <div className="space-y-2">
        <FormLabel>{t('profile.workType')}</FormLabel>
        <p className="helper-text">{t('profile.workTypeHint')}</p>
        <TogglePillGroup
          options={WORK_TYPES.map((workType) => ({
            value: workType,
            label: workTypeLabels[workType],
          }))}
          selectedValues={workTypes}
          onToggle={(value) => onWorkTypeToggle(value as WorkType)}
        />
      </div>

      {/* Location autocomplete */}
      <div className="mt-6 space-y-2">
        <FormLabel htmlFor="location-autocomplete">{t('profile.location')}</FormLabel>
        <p className="helper-text">{t('profile.locationHint')}</p>
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
        />
      </div>

      {/* Contextual callout when Location is a ranked value */}
      {hasLocationValue && (
        <div className="mt-3">
          <Alert variant="info">{t('profile.locationPriorityCallout')}</Alert>
        </div>
      )}
    </div>
  );
}
