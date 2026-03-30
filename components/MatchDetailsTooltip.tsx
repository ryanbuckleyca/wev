import { Lineicons } from '@lineiconshq/react-lineicons';
import {
  HeartSolid,
  Briefcase2Solid,
  LocationArrowRightSolid,
  CheckOutlined,
  XmarkOutlined,
} from '@lineiconshq/free-icons';
import type { IconDefinition } from '@lineiconshq/react-lineicons';
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
  profileIdealWorkEnvironment?: string | null;
  profileHasLocationValue?: boolean;
  matchedLocationTokens?: string[];
  unmatchedLocationTokens?: string[];
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

function MatchSection({
  icon,
  iconClass,
  label,
  percentage,
  children,
}: {
  icon: IconDefinition;
  iconClass: string;
  label: string;
  percentage: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="font-medium lowercase flex items-center gap-1 text-foreground">
        <Lineicons icon={icon} size={12} className={`flex-shrink-0 ${iconClass}`} />
        <span>
          {label}: {Math.round(percentage)}%
        </span>
      </div>
      <div className="pl-1.5 space-y-0.5">{children}</div>
    </div>
  );
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
  profileIdealWorkEnvironment,
  profileHasLocationValue,
  matchedLocationTokens,
  unmatchedLocationTokens,
}: MatchDetailsTooltipProps) {
  const formatValueLabel = (value: string) =>
    value
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase();

  const orderedValues = [
    ...values.filter((v) => sharedValues.includes(v)),
    ...values.filter((v) => !sharedValues.includes(v)),
  ].slice(0, 5);

  const orderedSkills = [
    ...skills.filter((s) => sharedSkills.includes(s)),
    ...skills.filter((s) => !sharedSkills.includes(s)),
  ]
    .filter((s) => skillTerms[s])
    .slice(0, 5);

  const workTypeLabel =
    jobWorkType === 'remote'
      ? translate('filters.workType.remote')
      : jobWorkType === 'hybrid'
        ? translate('filters.workType.hybrid')
        : translate('filters.workType.office');

  const workTypeMatched =
    !(profileWorkTypes && profileWorkTypes.length > 0) ||
    (profileWorkTypes ?? []).includes(jobWorkType ?? '');

  return (
    <div className="space-y-3">
      <div className="text-center">
        <ProgressDonut
          percentage={totalMatchPercentage}
          size="xl"
          text={`${totalMatchPercentage}%`}
        />
        <div className="text-xs opacity-75 lowercase">{translate('matchDetails.totalMatch')}</div>
        <div className="text-xs opacity-75 lowercase mt-1">
          {translate('matchDetails.breakdown')}
        </div>
        <div className="text-xs opacity-60 lowercase">{translate('matchDetails.weightsNote')}</div>
      </div>

      {orderedValues.length > 0 && (
        <MatchSection
          icon={HeartSolid}
          iconClass="text-wev-brand-accent"
          label={translate('matchDetails.values')}
          percentage={valueMatchPercentage}
        >
          {orderedValues.map((value) => (
            <MatchListItem
              key={`value-${value}`}
              id={`value-${value}`}
              label={formatValueLabel(value)}
              matched={sharedValues.includes(value)}
            />
          ))}
        </MatchSection>
      )}

      {orderedSkills.length > 0 && (
        <MatchSection
          icon={Briefcase2Solid}
          iconClass="text-primary"
          label={translate('matchDetails.skills')}
          percentage={skillMatchPercentage}
        >
          {orderedSkills.map((skill) => (
            <MatchListItem
              key={`skill-${skill}`}
              id={`skill-${skill}`}
              label={skillTerms[skill]}
              matched={sharedSkills.includes(skill)}
            />
          ))}
        </MatchSection>
      )}

      {typeof workTypeMatchPercentage === 'number' && jobWorkType && (
        <MatchSection
          icon={LocationArrowRightSolid}
          iconClass="text-primary"
          label={translate('matchDetails.workType')}
          percentage={workTypeMatchPercentage}
        >
          <MatchListItem
            id={`worktype-${jobWorkType}`}
            label={workTypeLabel}
            matched={workTypeMatched}
          />
        </MatchSection>
      )}

      {typeof locationMatchPercentage === 'number' && (
        <MatchSection
          icon={LocationArrowRightSolid}
          iconClass="text-primary"
          label={translate('matchDetails.location')}
          percentage={locationMatchPercentage}
        >
          {matchedLocationTokens?.map((tok, i) => (
            <MatchListItem key={`loc-match-${i}`} id={`loc-match-${i}`} label={tok} matched={true} />
          ))}
          {unmatchedLocationTokens?.map((tok, i) => (
            <MatchListItem
              key={`loc-unmatch-${i}`}
              id={`loc-unmatch-${i}`}
              label={tok}
              matched={false}
            />
          ))}
        </MatchSection>
      )}

      {profileHasLocationValue &&
        (!profileIdealWorkEnvironment || profileIdealWorkEnvironment.trim().length === 0) && (
          <div className="text-xs text-yellow-600 lowercase">
            {translate('matchDetails.locationRequiresProfile')}
          </div>
        )}
    </div>
  );
}
