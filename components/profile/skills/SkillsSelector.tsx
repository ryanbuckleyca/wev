'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import BrowseTrigger from '../BrowseTrigger';
import SkillsModal from './SkillsModal';
import SortableSelectedList from '../SortableSelectedList';
import type { EscoSkill } from '@/lib/types/skills';

export type { EscoSkill };

interface SkillsSelectorProps {
  allItems?: EscoSkill[];
  selectedSkills: EscoSkill[];
  skillCutoff: number;
  onToggle: (skill: EscoSkill) => void;
  onReorder: (from: number, to: number, newCutoff?: number) => void;
  onRemove: (uri: string) => void;
  locale: 'en' | 'fr';
  isLoading?: boolean;
}

export default function SkillsSelector({
  allItems = [],
  selectedSkills,
  skillCutoff,
  onToggle,
  onReorder,
  onRemove,
  locale,
  isLoading = false,
}: SkillsSelectorProps) {
  const t = useTranslations('profile');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const handleClose = () => {
    setQuery('');
    setOpen(false);
  };

  const sortableItems = selectedSkills.map((skill) => ({
    id: skill.uri,
    label: skill.preferredLabel[locale],
    sublabel: skill.description?.[locale] || undefined,
  }));

  return (
    <div className="flex flex-col gap-3">
      <BrowseTrigger
        onClick={() => setOpen(true)}
        isOpen={open}
        ariaLabel={t('skillsModalTriggerLabel')}
        placeholder={t('skillsPlaceholder')}
      />
      {sortableItems.length > 0 && (
        <SortableSelectedList
          variant="skills"
          items={sortableItems}
          rankCutoff={skillCutoff}
          onReorder={onReorder}
          onRemove={onRemove}
        />
      )}
      <SkillsModal
        isOpen={open}
        onClose={handleClose}
        query={query}
        onQueryChange={setQuery}
        onClearQuery={() => setQuery('')}
        selected={selectedSkills}
        onRemove={onRemove}
        onToggle={onToggle}
        allItems={allItems}
        isLoading={isLoading}
        locale={locale}
      />
    </div>
  );
}
