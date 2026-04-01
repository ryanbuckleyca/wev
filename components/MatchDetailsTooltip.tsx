import { useMemo } from 'react';
import { Lineicons } from '@lineiconshq/react-lineicons';
import { HeartSolid, Briefcase2Solid, LocationArrowRightSolid, CheckOutlined, XmarkOutlined } from '@lineiconshq/free-icons';
import ProgressDonut from './ProgressDonut';

type TranslateFn = (key: string, values?: Record<string, string | number>) => string;

interface MatchDetailsTooltipProps {
  totalMatchPercentage: number;
  valueMatchPercentage: number;
  skillMatchPercentage: number;
  workTypeMatchPercentage?: number;
  locationMatchPercentage?: number;
  values: string[];
  skills: string[];
  sharedValues: string[];
  sharedSkills: string[];
  skillTerms: Record<string, string>;
  translate: TranslateFn;
  jobWorkType?: string | null;
  jobMunicipality?: string | null;
  profileWorkTypes?: string[];
  profileHasLocationValue?: boolean;
}

function MatchListItem({ label, id, matched }: { label: string; id: string; matched: boolean }) {
  return (
    <div
      key={id}
      className={`text-xs lowercase flex items-center gap-1 ${matched ? '' : 'text-gray-400'}`}
    >
      <Lineicons
        icon={matched ? CheckOutlined : XmarkOutlined}
        size={11}
        className="flex-shrink-0"
      />
      {label}
    </div>
  );
}

function calcLocationSectionPercentage(
  workTypeMatchPercentage: number | undefined,
  locationMatchPercentage: number | undefined,
): number | null {
  const scores = [workTypeMatchPercentage, locationMatchPercentage].filter(
    (s): s is number => typeof s === 'number',
  );
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export default function MatchDetailsTooltip({
  totalMatchPercentage,
  valueMatchPercentage,
  skillMatchPercentage,
  workTypeMatchPercentage,
  locationMatchPercentage,
  values,
  skills,
  sharedValues,
  sharedSkills,
  skillTerms,
  translate,
  jobWorkType,
  jobMunicipality,
  profileWorkTypes,
  profileHasLocationValue,
}: MatchDetailsTooltipProps) {
  const textColor = 'rgb(var(--foreground))';

  const formatValueLabel = (value: string) =>
    value.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

  const orderedValues = [
    ...values.filter((value) => sharedValues.includes(value)),
    ...values.filter((value) => !sharedValues.includes(value)),
  ].slice(0, 5);

  const orderedSkills = [
    ...skills.filter((skill) => sharedSkills.includes(skill)),
    ...skills.filter((skill) => !sharedSkills.includes(skill)),
  ]
    .filter((skill) => skillTerms[skill])
    .slice(0, 5);

  const hasLocationSection =
    typeof workTypeMatchPercentage === 'number' || typeof locationMatchPercentage === 'number';

  const locationSectionPercentage = calcLocationSectionPercentage(
    workTypeMatchPercentage,
    locationMatchPercentage,
  );

  const workTypeLabels = useMemo<Record<string, string>>(
    () => ({
      remote: translate('filters.workType.remote'),
      hybrid: translate('filters.workType.hybrid'),
      office: translate('filters.workType.office'),
    }),
    [translate],
  );

  return (
    <div className="space-y-3">
      <div className="text-center">
        <ProgressDonut
          percentage={totalMatchPercentage}
          size="xl"
          text={`${totalMatchPercentage}%`}
        />
        <div className="text-xs opacity-75 lowercase">{translate('matchDetails.totalMatch')}</div>
        <div className="text-xs opacity-75 lowercase mt-1">{translate('matchDetails.breakdown')}</div>
        <div className="text-xs opacity-60 lowercase">{translate('matchDetails.weightsNote')}</div>
      </div>

      {orderedValues.length > 0 && (
        <div className="space-y-1">
          <div className="font-medium lowercase flex items-center gap-1" style={{ color: textColor }}>
            <Lineicons icon={HeartSolid} size={12} className="text-wev-brand-accent" />
            <span>{translate('matchDetails.values')}: {valueMatchPercentage}%</span>
          </div>
          {orderedValues.map((value) => (
            <MatchListItem
              key={`value-${value}`}
              id={`value-${value}`}
              label={formatValueLabel(value)}
              matched={sharedValues.includes(value)}
            />
          ))}
        </div>
      )}

      {orderedSkills.length > 0 && (
        <div className="space-y-1">
          <div className="font-medium lowercase flex items-center gap-1" style={{ color: textColor }}>
            <Lineicons icon={Briefcase2Solid} size={12} className="text-primary" />
            <span>{translate('matchDetails.skills')}: {skillMatchPercentage}%</span>
          </div>
          {orderedSkills.map((skill) => (
            <MatchListItem
              key={`skill-${skill}`}
              id={`skill-${skill}`}
              label={skillTerms[skill]}
              matched={sharedSkills.includes(skill)}
            />
          ))}
        </div>
      )}

      {hasLocationSection && (
        <div className="space-y-1">
          <div className="font-medium lowercase flex items-center gap-1" style={{ color: textColor }}>
            <Lineicons icon={LocationArrowRightSolid} size={12} className="text-wev-info" />
            <span>
              {translate('matchDetails.location')}
              {locationSectionPercentage !== null ? `: ${locationSectionPercentage}%` : ''}
            </span>
          </div>

          {typeof workTypeMatchPercentage === 'number' && jobWorkType && (
            <MatchListItem
              id={`worktype-${jobWorkType}`}
              label={workTypeLabels[jobWorkType] ?? jobWorkType}
              matched={!profileWorkTypes?.length || profileWorkTypes.includes(jobWorkType)}
            />
          )}

          {typeof locationMatchPercentage === 'number' && jobMunicipality && (
            <MatchListItem
              id="location-city"
              label={jobMunicipality}
              matched={locationMatchPercentage > 0}
            />
          )}

          {typeof locationMatchPercentage === 'number' && !jobMunicipality && (
            locationMatchPercentage === 100
              ? <MatchListItem id="location-distance" label={translate('matchDetails.locationNearby')} matched={true} />
              : locationMatchPercentage === 50
              ? <MatchListItem id="location-distance" label={translate('matchDetails.locationRegional')} matched={true} />
              : locationMatchPercentage === 0
              ? <MatchListItem id="location-distance" label={translate('matchDetails.locationOutOfRange')} matched={false} />
              : null
          )}

          {profileHasLocationValue && (
            <div className="text-xs text-muted-foreground lowercase">
              {translate('matchDetails.locationPrioritized')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
