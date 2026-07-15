/** Block pulse sized like a text line (not 1em cap-height, which looks undersized). */
function SkeletonLine({ className, tall }: { className?: string; tall?: boolean }) {
  return (
    <span
      aria-hidden
      className={`block skeleton-pulse rounded-sm ${tall ? 'h-5' : 'h-4'} ${className ?? 'w-full'}`}
    />
  );
}

function CardSkeleton() {
  return (
    <article className="bg-card border border-border rounded-wev-card overflow-hidden p-5 space-y-3">
      <SkeletonLine tall className="w-[70%]" />
      <SkeletonLine className="w-[55%]" />
      <SkeletonLine className="w-[85%]" />
      <SkeletonLine className="w-[40%]" />
    </article>
  );
}

type CardListSkeletonProps = {
  count?: number;
};

/** Generic card-list loading placeholders shared by the job board and org index. */
export default function CardListSkeleton({ count = 3 }: CardListSkeletonProps) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, index) => (
        <CardSkeleton key={index} />
      ))}
    </div>
  );
}
