'use client'

import { Toaster } from 'react-hot-toast'

export default function ToasterProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        className: 'design-toast',
        style: {
          padding: '1rem 1.5rem',
          borderRadius: '12px',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
        },
        success: {
          iconTheme: {
            primary: '#4a7c48',
            secondary: '#C5EBC3',
          },
          style: {
            background: 'var(--success-tint)',
            borderColor: '#a8d5a6',
            color: 'var(--text-primary)',
          },
        },
        error: {
          iconTheme: {
            primary: '#dc2626',
            secondary: '#F2D0CC',
          },
          style: {
            background: 'var(--alert-tint)',
            borderColor: '#ef8b8f',
            color: 'var(--text-primary)',
          },
        },
        loading: {
          iconTheme: {
            primary: '#1e40af',
            secondary: '#C3D9EB',
          },
          style: {
            background: 'var(--info-tint)',
            borderColor: '#93bed9',
            color: 'var(--text-primary)',
          },
        },
      }}
      containerStyle={{
        top: 20,
        right: 20,
      }}
    />
  )
}
