'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import WatercolorBackground from '@/components/WatercolorBackground';
import { SITE_CONFIG } from '@/lib/site-config';

export default function BulletinPageScaffold({ children }: { children: React.ReactNode }) {
  const t = useTranslations();

  return (
    <main
      className="min-h-screen pb-8 relative overflow-hidden"
      style={{
        background: 'var(--background)',
      }}
    >
      <WatercolorBackground />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 relative z-10">
        <header className="mb-8">
          <Image
            src={SITE_CONFIG.logotypeUrl}
            alt={t('home.heading')}
            width={100}
            height={40}
            className="main-logo wev-logotype w-[100px] h-auto mb-2"
            priority
          />
          <h1 className="text-xl font-medium text-primary">{t('home.heading')}</h1>
        </header>

        {children}
      </div>
    </main>
  );
}
