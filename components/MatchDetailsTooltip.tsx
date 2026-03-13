import { Lineicons } from '@lineiconshq/react-lineicons'
import { HeartSolid, Briefcase2Solid } from '@lineiconshq/free-icons'
import ProgressDonut from './ProgressDonut'

type TranslateFn = (key: string, values?: Record<string, any>) => string

interface MatchDetailsTooltipProps {
  totalMatchPercentage: number
  valueMatchPercentage: number
  skillMatchPercentage: number
  values: string[]
  skills: string[]
  sharedValues: string[]
  sharedSkills: string[]
  skillTerms: Record<string, string>
  translate: TranslateFn
}

export default function MatchDetailsTooltip({
  totalMatchPercentage,
  valueMatchPercentage,
  skillMatchPercentage,
  values,
  skills,
  sharedValues,
  sharedSkills,
  skillTerms,
  translate,
}: MatchDetailsTooltipProps) {
  const primaryColor = 'rgb(var(--primary))'
  const textColor = 'rgb(var(--foreground))'

  const formatValueLabel = (value: string) =>
    value
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()

  const orderedValues = [
    ...values.filter(value => sharedValues.includes(value)),
    ...values.filter(value => !sharedValues.includes(value)),
  ].slice(0, 5)

  const orderedSkills = [
    ...skills.filter(skill => sharedSkills.includes(skill)),
    ...skills.filter(skill => !sharedSkills.includes(skill)),
  ]
    .filter(skill => skillTerms[skill]) // Only show skills with terms
    .slice(0, 5)

  const renderListItem = (label: string, key: string, matched: boolean) => (
    <div key={key} className={`text-xs pl-4 lowercase ${matched ? '' : 'text-gray-400'}`}>
      {matched && '✓ '}
      {label}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="text-center">
        <ProgressDonut percentage={totalMatchPercentage} size="xl" text={`${totalMatchPercentage}%`} />
        <div className="text-xs opacity-75 lowercase">{translate('matchDetails.totalMatch')}</div>
      </div>

      {orderedValues.length > 0 && (
        <div className="space-y-1">
          <div className="font-medium lowercase flex items-center gap-1" style={{ color: textColor }}>
            <Lineicons icon={HeartSolid} size={12} className="text-wev-brand-accent" />
            <span>
              {translate('matchDetails.values')}: {valueMatchPercentage}%
            </span>
          </div>
          {orderedValues.map(value => {
            const isMatched = sharedValues.includes(value)
            const valueName = formatValueLabel(value)
            return renderListItem(valueName, `value-${value}`, isMatched)
          })}
        </div>
      )}

      {orderedSkills.length > 0 && (
        <div className="space-y-1">
          <div className="font-medium lowercase flex items-center gap-1" style={{ color: textColor }}>
            <Lineicons icon={Briefcase2Solid} size={12} className="text-primary" />
            <span>
              {translate('matchDetails.skills')}: {skillMatchPercentage}%
            </span>
          </div>
          {orderedSkills.map(skill => {
            const isMatched = sharedSkills.includes(skill)
            const skillName = skillTerms[skill]
            return renderListItem(skillName, `skill-${skill}`, isMatched)
          })}
        </div>
      )}
    </div>
  )
}
