import { Lineicons } from '@lineiconshq/react-lineicons'
import { HeartSolid, Briefcase2Solid } from '@lineiconshq/free-icons'

interface MatchDetailsTooltipProps {
  totalMatchPercentage: number
  valueMatchPercentage: number
  skillMatchPercentage: number
  values: string[]
  skills: string[]
  sharedValues: string[]
  sharedSkills: string[]
  skillTerms: Record<string, string>
  translate: (key: string, values?: Record<string, unknown>) => string
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
  const textColor = 'rgb(var(--text-primary))'

  const orderedValues = [
    ...values.filter(value => sharedValues.includes(value)),
    ...values.filter(value => !sharedValues.includes(value)),
  ].slice(0, 5)

  const orderedSkills = [
    ...skills.filter(skill => sharedSkills.includes(skill)),
    ...skills.filter(skill => !sharedSkills.includes(skill)),
  ].slice(0, 5)

  const renderListItem = (label: string, key: string, matched: boolean) => (
    <div key={key} className={`text-xs pl-4 lowercase ${matched ? '' : 'text-gray-400'}`}>
      {matched && '✓ '}
      {label}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="text-center">
        <div className="relative inline-flex items-center justify-center">
          <div
            className="rounded-full relative"
            style={{
              width: 45,
              height: 45,
              background: `conic-gradient(from 0deg, ${primaryColor} 0deg ${totalMatchPercentage * 3.6}deg, #f9fafb ${totalMatchPercentage * 3.6}deg)` ,
              border: `2px solid ${primaryColor}`,
            }}
          >
            <div className="absolute inset-1 rounded-full bg-white flex items-center justify-center">
              <span className="font-bold" style={{ fontSize: 11, color: primaryColor }}>
                {totalMatchPercentage}%
              </span>
            </div>
          </div>
        </div>
        <div className="text-xs opacity-75 lowercase">{translate('matchDetails.totalMatch')}</div>
      </div>

      {orderedValues.length > 0 && (
        <div className="space-y-1">
          <div className="font-medium lowercase flex items-center gap-1" style={{ color: textColor }}>
            <Lineicons icon={HeartSolid} size={12} className="text-wev-accent" />
            <span>
              {translate('matchDetails.values')}: {valueMatchPercentage}%
            </span>
          </div>
          {orderedValues.map(value => {
            const isMatched = sharedValues.includes(value)
            const valueName = translate(`values.${value}.name`, { defaultValue: value })
            return renderListItem(valueName, `value-${value}`, isMatched)
          })}
        </div>
      )}

      {orderedSkills.length > 0 && (
        <div className="space-y-1">
          <div className="font-medium lowercase flex items-center gap-1" style={{ color: textColor }}>
            <Lineicons icon={Briefcase2Solid} size={12} className="text-wev-primary" />
            <span>
              {translate('matchDetails.skills')}: {skillMatchPercentage}%
            </span>
          </div>
          {orderedSkills.map(skill => {
            const isMatched = sharedSkills.includes(skill)
            const skillName = skillTerms[skill] || skill
            return renderListItem(skillName, `skill-${skill}`, isMatched)
          })}
        </div>
      )}
    </div>
  )
}
