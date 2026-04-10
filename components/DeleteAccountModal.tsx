'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useDeleteAccount } from '@/lib/hooks/useDeleteAccount';
import Button from './Button';
import FormField from './FormField';
import ErrorMessage from './ErrorMessage';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/Dialog';
import TurnstileWidget from './TurnstileWidget';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DeleteAccountModal({ isOpen, onClose }: DeleteAccountModalProps) {
  const t = useTranslations();
  const { deleteAccount, isDeleting, error: deleteError } = useDeleteAccount();
  
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [validationError, setValidationError] = useState('');

  const handleDelete = async () => {
    // Clear previous validation errors
    setValidationError('');

    // Validate inputs
    if (!password.trim()) {
      setValidationError(t('deleteAccount.passwordRequired'));
      return;
    }

    if (confirmText !== 'DELETE' && confirmText !== 'SUPPRIMER') {
      setValidationError(t('deleteAccount.confirmationRequired'));
      return;
    }

    if (!captchaToken) {
      setValidationError(t('deleteAccount.captchaRequired'));
      return;
    }

    try {
      await deleteAccount({ password, captchaToken });
      // Success - user will be redirected
    } catch (err) {
      // Error is already set by the hook
      console.error('Delete account error:', err);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isDeleting) {
      setPassword('');
      setConfirmText('');
      setCaptchaToken(null);
      setValidationError('');
      onClose();
    }
  };

  const displayError = validationError || deleteError;

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

          <TurnstileWidget
            onSuccess={(token) => {
              setCaptchaToken(token);
              setValidationError('');
            }}
            onError={() => {
              setCaptchaToken(null);
              setValidationError(t('deleteAccount.captchaError'));
            }}
            onExpire={() => {
              setCaptchaToken(null);
            }}
          />

          {displayError && <ErrorMessage>{displayError}</ErrorMessage>}
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
            disabled={isDeleting || !captchaToken}
            className="flex-1 sm:flex-none bg-wev-destructive-tint text-destructive-foreground border-none"
          >
            {isDeleting ? t('deleteAccount.deleting') : t('deleteAccount.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
