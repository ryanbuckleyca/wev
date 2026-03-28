'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import Button from './Button';
import FormField from './FormField';
import ErrorMessage from './ErrorMessage';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/Dialog';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DeleteAccountModal({ isOpen, onClose }: DeleteAccountModalProps) {
  const t = useTranslations();
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (!password.trim()) {
      setError(t('deleteAccount.passwordRequired'));
      return;
    }

    if (confirmText !== 'DELETE' && confirmText !== 'SUPPRIMER') {
      setError(t('deleteAccount.confirmationRequired'));
      return;
    }

    setIsDeleting(true);
    setError('');

    try {
      const response = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete account');
      }

      // Sign out to clear the session
      const supabase = createClient();
      await supabase.auth.signOut();

      // Hard redirect to clear any cached data
      window.location.href = '/';
    } catch (err) {
      console.error('Delete account error:', err);
      setError(err instanceof Error ? err.message : t('deleteAccount.error'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isDeleting) {
      setPassword('');
      setConfirmText('');
      setError('');
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-red-600">{t('deleteAccount.title')}</DialogTitle>
        </DialogHeader>

        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800 mb-2">{t('deleteAccount.warning')}</p>
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
              placeholder={
                t('deleteAccount.confirmLabel').includes('SUPPRIMER') ? 'SUPPRIMER' : 'DELETE'
              }
              disabled={isDeleting}
              htmlFor="delete-confirm"
            />
            <p className="text-sm text-gray-600">{t('deleteAccount.confirmHelp')}</p>
          </div>

          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>

        <DialogFooter className="gap-3 sm:gap-2">
          <Button
            variant="secondary"
            onClick={() => handleOpenChange(false)}
            disabled={isDeleting}
            className="flex-1 sm:flex-none"
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex-1 sm:flex-none bg-wev-destructive-tint text-destructive-foreground border-none"
          >
            {isDeleting ? t('deleteAccount.deleting') : t('deleteAccount.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
