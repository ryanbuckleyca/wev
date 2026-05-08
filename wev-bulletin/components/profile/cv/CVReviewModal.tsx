'use client';

import { useEffect, useId } from 'react';
import { useTranslations } from 'next-intl';
import Button from '@/components/Button';
import Alert from '@/components/ui/Alert';
import CountBadge from '@/components/CountBadge';
import SkillsSelector from '@/components/profile/skills/SkillsSelector';
import ValuesSelector from '@/components/profile/values/ValuesSelector';
import { useRankedList } from '@/lib/hooks/useRankedList';
import { MAX_PROFILE_SKILLS, MAX_PROFILE_VALUES } from '@/lib/profile/profileMapping';
import type { EscoSkill } from '@/lib/types/skills';
import type { WorkValue } from '@/lib/values';

type CVReviewModalProps = {
  isOpen: boolean;
  locale: 'en' | 'fr';
  allSkills: EscoSkill[];
  workValues: WorkValue[];
  initialSkills: EscoSkill[];
  initialValues: string[];
  fileName: string;
  onCancel: () => void;
  onConfirm: (data: {
    skills: EscoSkill[];
    values: string[];
    skillCutoff: number;
    valueCutoff: number;
  }) => Promise<void>;
  isConfirming: boolean;
};

export default function CVReviewModal({
  isOpen,
  locale,
  allSkills,
  workValues,
  initialSkills,
  initialValues,
  fileName,
  onCancel,
  onConfirm,
  isConfirming,
}: CVReviewModalProps) {
  const t = useTranslations('profile');
  const titleId = useId();

  const skills = useRankedList<EscoSkill>((skill) => skill.uri);
  const values = useRankedList<string>((valueId) => valueId);

  useEffect(() => {
    if (!isOpen) return;
    // Suggestions are returned in best-first order from the API routes, so we
    // start with every item ranked. The user can drag below the divider to
    // demote/unrank.
    skills.setItems(initialSkills);
    skills.setCutoff(initialSkills.length);
    values.setItems(initialValues);
    values.setCutoff(initialValues.length);
  }, [initialSkills, initialValues, isOpen, skills, values]);

  useEffect(() => {
    if (!isOpen) return;
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isConfirming) {
        onCancel();
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isOpen, isConfirming, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg border bg-card shadow-xl">
        <div className="border-b px-4 py-3 sm:px-6">
          <h2 id={titleId} className="text-lg font-semibold">
            {t('cvReviewTitle')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('cvReviewFile', { fileName })}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <Alert className="mb-4" variant="warning">
            {t('cvSuggestionDisclaimer')}
          </Alert>

          <div className="space-y-6">
            <section>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-sm font-semibold">{t('skills')}</h3>
                <CountBadge count={skills.items.length} max={MAX_PROFILE_SKILLS} />
              </div>
              <SkillsSelector
                allItems={allSkills}
                selectedSkills={skills.items}
                skillCutoff={skills.cutoff}
                onToggle={skills.toggle}
                onReorder={skills.reorder}
                onRemove={skills.remove}
                locale={locale}
                isLoading={false}
              />
            </section>

            <section>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-sm font-semibold">{t('workValues')}</h3>
                <CountBadge count={values.items.length} max={MAX_PROFILE_VALUES} />
              </div>
              <ValuesSelector
                values={workValues}
                selectedValues={values.items}
                valueCutoff={values.cutoff}
                onToggle={values.toggle}
                onReorder={values.reorder}
                onRemove={values.remove}
                locale={locale}
              />
            </section>
          </div>
        </div>

        <div className="border-t px-4 py-3 sm:px-6">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => skills.setItems([])} disabled={isConfirming}>
                {t('cvClearSkills')}
              </Button>
              <Button variant="outline" onClick={() => values.setItems([])} disabled={isConfirming}>
                {t('cvClearValues')}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onCancel} disabled={isConfirming}>
                {t('cvCancel')}
              </Button>
              <Button
                onClick={() =>
                  onConfirm({
                    skills: skills.items,
                    values: values.items,
                    skillCutoff: skills.cutoff,
                    valueCutoff: values.cutoff,
                  })
                }
                loading={isConfirming}
                disabled={isConfirming}
              >
                {t('cvConfirmSave')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
