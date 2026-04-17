'use client';

import dynamic from 'next/dynamic';

const Toaster = dynamic(() => import('@/components/Toaster'), {
  ssr: false,
});

export default function DeferredToaster() {
  return <Toaster />;
}
