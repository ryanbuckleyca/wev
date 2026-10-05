'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/AuthContext';
import { buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

/** Admin manage/add links for the org index — client-only so the page stays anonymous SSR. */
export default function OrganizationIndexAdminLinks({ locale }: { locale: string }) {
  const { role, loading } = useAuth();
  const tAdmin = useTranslations('admin.organizations');

  if (loading || role !== 'admin') return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        href={`/${locale}/admin/organizations`}
        className={cn(buttonVariants({ variant: 'secondary' }))}
      >
        {tAdmin('actions.manage')}
      </Link>
      <Link
        href={`/${locale}/admin/organizations/new`}
        className={cn(buttonVariants({ variant: 'default' }))}
      >
        {tAdmin('actions.addNew')}
      </Link>
    </div>
  );
}
