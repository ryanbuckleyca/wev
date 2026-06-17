import LoadingState from '@/components/LoadingState';

/** Route-level fallback — home uses BulletinPageSkeleton inside its own Suspense. */
export default function GlobalLoading() {
  return <LoadingState />;
}
