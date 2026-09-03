'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { setOrganizationAssessmentReview } from '@/lib/organizations/actions';
import { ORG_SKIP_REASON_IGNORED } from '@/lib/organizations/assessment-review';
import notify from '@/lib/toast';

interface OrgReviewActionsProps {
  orgId: number;
  /** Current assessment_skip_reason; Ignore is hidden when already ignored. */
  currentReason: string | null;
  locale: string;
  disabled?: boolean;
  /**
   * Wrapper classes. Pass `contents` to dissolve the wrapper so these buttons
   * become flex items of the caller's container and align with its other
   * children instead of wrapping as an independent group.
   */
  className?: string;
}

/**
 * Retry / Ignore controls for a parked organization.
 *
 * Retry clears the skip reason so catch-up may assess the org once more; Ignore
 * drops it out of the Needs review queue for good.
 */
export default function OrgReviewActions({
  orgId,
  currentReason,
  locale,
  disabled = false,
  className = 'flex flex-wrap gap-2',
}: OrgReviewActionsProps) {
  const t = useTranslations('admin.organizations');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRunning, setIsRunning] = useState(false);

  const busy = disabled || isPending || isRunning;

  const run = async (action: 'retry' | 'ignore') => {
    setIsRunning(true);
    try {
      const result = await setOrganizationAssessmentReview(orgId, action);

      if (!result.ok) {
        if (result.error === 'unauthorized') {
          notify.error(t('errors.unauthorized'));
          router.push(`/${locale}/login`);
          return;
        }
        notify.error(t('review.actionFailed'));
        return;
      }

      notify.success(action === 'retry' ? t('review.retrySuccess') : t('review.ignoreSuccess'));
      startTransition(() => router.refresh());
    } catch (err) {
      console.error('Organization review action error:', err);
      notify.error(t('review.actionFailed'));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className={className}>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => run('retry')}
      >
        {t('actions.retry')}
      </Button>
      {currentReason !== ORG_SKIP_REASON_IGNORED && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => run('ignore')}
        >
          {t('actions.ignore')}
        </Button>
      )}
    </div>
  );
}
