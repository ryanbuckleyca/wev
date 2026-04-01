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
    value
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase();

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

  const renderListItem = (label: string, key: string, matched: boolean) => (
    <div
      key={key}
      className={`text-xs lowercase flex items-center gap-1 ${matched ? '' : 'text-gray-400'}`}
    >
      {matched ? (
        <Lineicons icon={CheckOutlined} size={11} className="flex-shrink-0" />
      ) : (
        <Lineicons icon={XmarkOutlined} size={11} className="flex-shrink-0" />
      )}
      {label}
    </div>
  );

  // Combined location section: show when either work type or location score is available
  const hasLocationSection =
    typeof workTypeMatchPercentage === 'number' || typeof locationMatchPercentage === 'number';

  // Combined score: average of available sub-scores
  const locationSectionPercentage = (() => {
    const scores = [
      typeof workTypeMatchPercentage === 'number' ? workTypeMatchPercentage : null,
      typeof locationMatchPercentage === 'number' ? locationMatchPercentage : null,
    ].filter((s): s is number => s !== null);
    if (scores.length === 0) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  })();

  const workTypeLabels: Record<string, string> = {
    remote: translate('filters.workType.remote'),
    hybrid: translate('filters.workType.hybrid'),
    office: translate('filters.workType.office'),
  };

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
          {orderedValues.map((value) =>
            renderListItem(formatValueLabel(value), `value-${value}`, sharedValues.includes(value))
          )}
        </div>
      )}

      {orderedSkills.length > 0 && (
        <div className="space-y-1">
          <div className="font-medium lowercase flex items-center gap-1" style={{ color: textColor }}>
            <Lineicons icon={Briefcase2Solid} size={12} className="text-primary" />
            <span>{translate('matchDetails.skills')}: {skillMatchPercentage}%</span>
          </div>
          {orderedSkills.map((skill) =>
            renderListItem(skillTerms[skill], `skill-${skill}`, sharedSkills.includes(skill))
          )}
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

          {/* Work type: show job's work type, check if it matches profile preference */}
          {typeof workTypeMatchPercentage === 'number' && jobWorkType &&
            renderListItem(
              workTypeLabels[jobWorkType] ?? jobWorkType,
              `worktype-${jobWorkType}`,
              !profileWorkTypes?.length || profileWorkTypes.includes(jobWorkType),
            )
          }

          {/* Distance: show job's city, check if it matches profile location */}
          {typeof locationMatchPercentage === 'number' && jobMunicipality &&
            renderListItem(
              jobMunicipality,
              'location-city',
              locationMatchPercentage > 0,
            )
          }

          {/* No city on job but we have a distance score */}
          {typeof locationMatchPercentage === 'number' && !jobMunicipality && (
            locationMatchPercentage === 100
              ? renderListItem(translate('matchDetails.locationNearby'), 'location-distance', true)
              : locationMatchPercentage === 50
              ? renderListItem(translate('matchDetails.locationRegional'), 'location-distance', true)
              : locationMatchPercentage === 0
              ? renderListItem(translate('matchDetails.locationOutOfRange'), 'location-distance', false)
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
