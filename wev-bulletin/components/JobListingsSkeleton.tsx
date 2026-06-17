'use client';

/** Pure-CSS pulse skeleton block using design tokens via var(--muted-foreground). */
function SkeletonPulse({ className }: { className?: string }) {
  return <span aria-hidden className={`skeleton-pulse ${className ?? ''}`} />;
}

const SkeletonRow = ({ iconW, textW, ml }: { iconW?: string; textW: string; ml?: boolean }) => (
  <div className={`flex items-center gap-2 ${ml ? 'ml-12' : ''}`}>
    {iconW && <SkeletonPulse className={iconW} />}
    <SkeletonPulse className={textW} />
  </div>
);

export function JobCardSkeleton() {
  return (
    <article className="bg-card border border-border rounded-wev-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border text-sm">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <SkeletonPulse className="icon shrink-0" />
          <SkeletonPulse className="w-[60%]" />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <SkeletonPulse className="icon" />
          <SkeletonPulse className="icon" />
        </div>
      </div>

      <div className="job-details py-4 px-5 space-y-3 leading-relaxed">
        <SkeletonRow iconW="w-10" textW="w-32" />
        <SkeletonRow iconW="w-12" textW="w-52" />
        <SkeletonRow iconW="w-14" textW="w-28" />
        <div className="flex flex-col gap-1.5">
          <SkeletonRow iconW="w-10" textW="w-[75%]" />
          <SkeletonRow textW="w-[65%]" ml={true} />
          <SkeletonRow textW="w-[70%]" ml={true} />
        </div>
        <SkeletonRow iconW="w-12" textW="w-36" />
        <SkeletonRow iconW="w-[4.5rem]" textW="w-40" />
      </div>

      <div className="px-4 py-3 bg-muted border-t border-border text-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 pr-4 border-r border-border">
            <SkeletonPulse className="h-8 w-8 rounded-full" />
            <SkeletonPulse className="w-8" />
          </div>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <SkeletonPulse className="pill w-20" />
            <SkeletonPulse className="pill w-24" />
            <SkeletonPulse className="pill w-16" />
          </div>
        </div>
      </div>
    </article>
  );
}

type JobListingsSkeletonProps = {
  count?: number;
};

export default function JobListingsSkeleton({ count = 3 }: JobListingsSkeletonProps) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, index) => (
        <JobCardSkeleton key={index} />
      ))}
    </div>
  );
}
