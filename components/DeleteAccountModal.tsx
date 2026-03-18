'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from '@/i18n/navigation'
import toast from 'react-hot-toast'
import Button from './Button'
import FormField from './FormField'
import ErrorMessage from './ErrorMessage'

interface DeleteAccountModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function DeleteAccountModal({ isOpen, onClose }: DeleteAccountModalProps) {
  const t = useTranslations()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState('')

  const handleDelete = async () => {
    if (!password.trim()) {
      setError(t('deleteAccount.passwordRequired'))
      return
    }

    if (confirmText !== 'DELETE' && confirmText !== 'SUPPRIMER') {
      setError(t('deleteAccount.confirmationRequired'))
      return
    }

    setIsDeleting(true)
    setError('')

    try {
      const response = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete account')
      }

      // Account deleted successfully - redirect immediately without trying to sign out
      // The account is already gone, so signing out will fail
      toast.success(t('deleteAccount.success'))
      
      // Hard redirect to clear any cached session data
      window.location.href = '/'
      
    } catch (err) {
      console.error('Delete account error:', err)
      setError(err instanceof Error ? err.message : t('deleteAccount.error'))
    } finally {
      setIsDeleting(false)
    }
  }

  const handleClose = () => {
    if (!isDeleting) {
      setPassword('')
      setConfirmText('')
      setError('')
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-xl font-semibold text-red-600 mb-4">
          {t('deleteAccount.title')}
        </h2>
        
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800 mb-2">
            {t('deleteAccount.warning')}
          </p>
          <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
            <li>{t('deleteAccount.warningProfile')}</li>
            <li>{t('deleteAccount.warningBookmarks')}</li>
            <li>{t('deleteAccount.warningMatches')}</li>
            <li>{t('deleteAccount.warningIrreversible')}</li>
          </ul>
        </div>

        <div className="space-y-4">
          <FormField
            label={t('deleteAccount.passwordLabel')}
            type="password"
            value={password}
            onChange={setPassword}
            placeholder={t('deleteAccount.passwordPlaceholder')}
            disabled={isDeleting}
            htmlFor="delete-password"
          />

          <div className="space-y-2">
            <FormField
              label={t('deleteAccount.confirmLabel')}
              type="text"
              value={confirmText}
              onChange={setConfirmText}
              placeholder={t('deleteAccount.confirmLabel').includes('SUPPRIMER') ? 'SUPPRIMER' : 'DELETE'}
              disabled={isDeleting}
              htmlFor="delete-confirm"
            />
            <p className="text-sm text-gray-600">
              {t('deleteAccount.confirmHelp')}
            </p>
          </div>

          {error && <ErrorMessage message={error} />}

          <div className="flex gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={handleClose}
              disabled={isDeleting}
              className="flex-1"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleDelete}
              disabled={isDeleting || !password.trim() || (confirmText !== 'DELETE' && confirmText !== 'SUPPRIMER')}
              className="flex-1 bg-wev-destructive-tint text-destructive-foreground border-none"
            >
              {isDeleting ? t('deleteAccount.deleting') : t('deleteAccount.confirm')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}