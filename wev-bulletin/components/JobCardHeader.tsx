'use client';

import { Lineicons } from '@lineiconshq/react-lineicons';
import {
  Leaf1Solid,
  Leaf1Outlined,
  Bookmark1Solid,
  Bookmark1Outlined,
  ChevronDownSolid,
} from '@lineiconshq/free-icons';
import { type JobPosting } from '@/lib/supabase';
import { JOB_BOARD_TEST_IDS } from '@/lib/testing/job-board-contract';

interface JobCardHeaderProps {
  job: JobPosting;
  isAdmin: boolean;
  sse: boolean;
  updatingId: string | null;
  onSseToggle: (job: JobPosting) => void;
  bookmarked: boolean;
  bookmarkLoading: boolean;
  onBookmarkToggle: () => void;
  isExpanded: boolean;
  onExpandToggle: () => void;
  summary: string;
  /** Whether the card renders a footer below; drives the header's bottom divider. */
  hasFooter: boolean;
  t: (key: string, values?: Record<string, string | number>) => string;
}

export default function JobCardHeader({
  job,
  isAdmin,
  sse,
  updatingId,
  onSseToggle,
  bookmarked,
  bookmarkLoading,
  onBookmarkToggle,
  isExpanded,
  onExpandToggle,
  summary,
  hasFooter,
  t,
}: JobCardHeaderProps) {
  return (
    <div
      className={`flex items-center justify-between px-3 py-2 rounded-t-wev-card transition-all duration-300 bg-card ${
        hasFooter ? 'border-b border-border' : ''
      }`}
    >
      {/* Left side: SSE + Summary */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {isAdmin ? (
          <button
            onClick={() => {
              const msg = sse
                ? t('jobCard.removeSseConfirm', { title: job.job_title, org: job.organization })
                : t('jobCard.markSseConfirm', { title: job.job_title, org: job.organization });
              if (window.confirm(msg)) onSseToggle(job);
            }}
            disabled={updatingId === job.id}
            className="wev-icon-btn disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            title={sse ? t('jobCard.removeSse') : t('jobCard.markSse')}
            aria-label={sse ? t('jobCard.sseJob') : t('jobCard.markSseJob')}
          >
            {sse ? (
              <Lineicons icon={Leaf1Solid} size={16} className="text-wev-success" />
            ) : (
              <Lineicons icon={Leaf1Outlined} size={16} className="text-muted-foreground" />
            )}
          </button>
        ) : sse ? (
          <span className="flex-shrink-0" role="img" aria-label={t('jobCard.sseJobLabel')}>
            <Lineicons icon={Leaf1Solid} size={16} className="text-wev-success" />
          </span>
        ) : null}
        <span className="text-sm text-muted-foreground truncate pr-2">{summary}</span>
      </div>

      {/* Right side: Bookmark + Collapse */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onBookmarkToggle}
          data-testid={JOB_BOARD_TEST_IDS.bookmarkButton}
          className="wev-icon-btn"
          title={bookmarked ? t('jobCard.removeBookmark') : t('jobCard.bookmarkJob')}
          aria-label={bookmarked ? t('jobCard.bookmarked') : t('jobCard.bookmarkJobLabel')}
          disabled={bookmarkLoading}
          aria-busy={bookmarkLoading}
        >
          {bookmarked ? (
            <Lineicons icon={Bookmark1Solid} size={16} className="text-wev-info" />
          ) : (
            <Lineicons icon={Bookmark1Outlined} size={16} className="text-muted-foreground" />
          )}
        </button>
        <button
          onClick={onExpandToggle}
          className="wev-icon-btn"
          title={isExpanded ? t('jobCard.collapse') : t('jobCard.expand')}
          aria-label={isExpanded ? t('jobCard.collapseDetails') : t('jobCard.expandDetails')}
        >
          <Lineicons
            icon={ChevronDownSolid}
            size={18}
            className={`text-muted-foreground transition-transform duration-200 ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
        </button>
      </div>
    </div>
  );
}
