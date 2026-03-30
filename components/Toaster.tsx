'use client';

import { Toaster } from 'react-hot-toast';

export default function ToasterProvider() {
  return (
    <Toaster
      position="top-center"
      containerStyle={{ top: 20 }}
      toastOptions={{
        style: {
          background: 'transparent',
          boxShadow: 'none',
          padding: 0,
        },
      }}
    />
  );
}
