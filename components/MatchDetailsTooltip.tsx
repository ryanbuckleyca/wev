import { Lineicons } from '@lineiconshq/react-lineicons';
import { HeartSolid, Briefcase2Solid, CheckOutlined, XmarkOutlined } from '@lineiconshq/free-icons';
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
    .filter((skill) => skillTerms[skill]) // Only show skills with terms
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
          <div
            className="font-medium lowercase flex items-center gap-1"
            style={{ color: textColor }}
          >
            <Lineicons icon={HeartSolid} size={12} className="text-wev-brand-accent" />
            <span>
              {translate('matchDetails.values')}: {valueMatchPercentage}%
            </span>
          </div>
          {orderedValues.map((value) => {
            const isMatched = sharedValues.includes(value);
            const valueName = formatValueLabel(value);
            return renderListItem(valueName, `value-${value}`, isMatched);
          })}
        </div>
      )}

      {orderedSkills.length > 0 && (
        <div className="space-y-1">
          <div
            className="font-medium lowercase flex items-center gap-1"
            style={{ color: textColor }}
          >
            <Lineicons icon={Briefcase2Solid} size={12} className="text-primary" />
            <span>
              {translate('matchDetails.skills')}: {skillMatchPercentage}%
            </span>
          </div>
          {orderedSkills.map((skill) => {
            const isMatched = sharedSkills.includes(skill);
            const skillName = skillTerms[skill];
            return renderListItem(skillName, `skill-${skill}`, isMatched);
          })}
        </div>
      )}

      {typeof workTypeMatchPercentage === 'number' && (
        <div className="space-y-1">
          <div className="font-medium lowercase flex items-center gap-1" style={{ color: textColor }}>
            <span>
              {translate('matchDetails.workType')}: {Math.round(workTypeMatchPercentage)}%
            </span>
          </div>
          {jobWorkType && (
            <div className="pl-3">
              {(() => {
                const workTypeLabels: Record<string, string> = {
                  remote: translate('filters.workType.remote'),
                  hybrid: translate('filters.workType.hybrid'),
                  office: translate('filters.workType.office'),
                };
                const label = workTypeLabels[jobWorkType] ?? jobWorkType;
                const matched = !profileWorkTypes?.length || profileWorkTypes.includes(jobWorkType);
                return renderListItem(label, `worktype-${jobWorkType}`, matched);
              })()}
            </div>
          )}
        </div>
      )}

      {typeof locationMatchPercentage === 'number' && (
        <div className="space-y-1">
          <div className="font-medium lowercase flex items-center gap-1" style={{ color: textColor }}>
            <span>
              {translate('matchDetails.location')}: {Math.round(locationMatchPercentage)}%
            </span>
          </div>
          {locationMatchPercentage === 0 && profileHasLocationValue && (
            <div className="text-xs text-yellow-600 lowercase">{translate('matchDetails.locationOutOfRange')}</div>
          )}
        </div>
      )}
    </div>
  );
}
