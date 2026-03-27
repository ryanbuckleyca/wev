import { Badge } from '@/components/ui/Badge'
import { Checkbox } from '@/components/ui/Checkbox'
import { useTranslations } from 'next-intl'
import type { EscoSkill } from '../SkillsSelector'

interface SkillItemProps {
  skill: EscoSkill & {
    label: string
    internalMatchedAlias?: string | null
  }
  isSelected: boolean
  onToggle: () => void
  locale: 'en' | 'fr'
}

const SKILL_TYPE_COLOURS: Record<string, string> = {
  skill: 'bg-green-50 text-green-700 border-green-200',
  knowledge: 'bg-yellow-50 text-yellow-800 border-yellow-200',
}

const REUSE_LEVEL_COLOURS: Record<string, string> = {
  transversal: 'bg-green-50 text-green-700 border-green-200',
  'cross-sector': 'bg-blue-50 text-blue-700 border-blue-200',
  'sector-specific': 'bg-purple-50 text-purple-700 border-purple-200',
  'occupation-specific': 'bg-orange-50 text-orange-700 border-orange-200',
}

function formatEnumLabel(value: string | null | undefined): string {
  const clean = (value ?? '').trim()
  if (!clean) return ''
  return clean
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export default function SkillItem({ skill, isSelected, onToggle, locale }: SkillItemProps) {
  const t = useTranslations('profile')

  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={onToggle}
      className="flex cursor-pointer items-start gap-4 border-b border-gray-50 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 dark:border-zinc-800/50 dark:hover:bg-zinc-900/50"
    >
      <Checkbox checked={isSelected} readOnly className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="text-[13px] font-bold text-gray-900 dark:text-zinc-100 break-words">
          {skill.label}
        </p>
        {skill.description?.[locale] && (
          <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-gray-500 dark:text-zinc-400 line-clamp-2 break-words">
            {skill.description[locale]}
          </p>
        )}
        {skill.internalMatchedAlias && (
          <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 inline-block px-2 py-0.5 rounded-md dark:bg-blue-900/40 dark:text-blue-300 break-words">
            {t('skillsMatchedAlias')}
            &quot;{skill.internalMatchedAlias}&quot;
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap gap-1">
          {skill.skillType && (
            <Badge variant="outline" className={`text-[10px] ${SKILL_TYPE_COLOURS[skill.skillType] || ''}`}>
              {formatEnumLabel(skill.skillType)}
            </Badge>
          )}
          {skill.reuseLevel && (
            <Badge variant="outline" className={`text-[10px] ${REUSE_LEVEL_COLOURS[skill.reuseLevel] || ''}`}>
              {formatEnumLabel(skill.reuseLevel)}
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}
