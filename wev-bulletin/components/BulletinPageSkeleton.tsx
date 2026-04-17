import BulletinPageContentSkeleton from '@/components/BulletinPageContentSkeleton';
import BulletinPageScaffold from '@/components/BulletinPageScaffold';

export default function BulletinPageSkeleton() {
  return (
    <BulletinPageScaffold>
      <BulletinPageContentSkeleton />
    </BulletinPageScaffold>
  );
}
