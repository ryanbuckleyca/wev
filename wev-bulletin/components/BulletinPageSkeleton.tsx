import Image from 'next/image';
import { SITE_CONFIG } from '@/lib/site-config';

function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden className={`animate-pulse rounded-wev-btn bg-muted/70 ${className}`} />;
}

export default function BulletinPageSkeleton() {
  return (
    <main
      className="min-h-screen pb-8 relative overflow-hidden"
      style={{
        background: 'var(--background)',
      }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-36 -left-28 h-[38rem] w-[38rem] rounded-full blur-[90px]"
          style={{
            background: 'var(--watercolor-lavender)',
            opacity: 'var(--lavender-opacity, 0.24)',
          }}
        />
        <div
          className="absolute -top-8 right-[-12rem] h-[32rem] w-[32rem] rounded-full blur-[90px]"
          style={{
            background: 'var(--watercolor-blue)',
            opacity: 'var(--blue-opacity, 0.2)',
          }}
        />
      </div>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 relative z-10">
        <header className="mb-8">
          <Image
            src={SITE_CONFIG.logotypeUrl}
            alt=""
            width={100}
            height={40}
            className="main-logo wev-logotype w-[100px] h-auto mb-2"
            priority
          />
          <SkeletonBlock className="h-7 w-56 max-w-full" />
        </header>

        <div className="bg-card border border-border rounded-wev-card mb-4 p-4 sm:p-6 space-y-4">
          <SkeletonBlock className="h-11 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SkeletonBlock className="h-28 w-full" />
            <SkeletonBlock className="h-28 w-full" />
            <SkeletonBlock className="h-40 w-full" />
            <SkeletonBlock className="h-40 w-full" />
          </div>
        </div>

        <div className="flex items-center justify-between pl-2 pr-1 py-1 mb-4 gap-4">
          <SkeletonBlock className="h-4 w-44" />
          <SkeletonBlock className="h-8 w-40" />
        </div>

        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="bg-card border border-border rounded-wev-card overflow-hidden p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3 flex-1">
                  <SkeletonBlock className="h-6 w-3/4" />
                  <SkeletonBlock className="h-4 w-1/2" />
                </div>
                <SkeletonBlock className="h-9 w-24 shrink-0" />
              </div>
              <SkeletonBlock className="h-24 w-full rounded-wev-card" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
