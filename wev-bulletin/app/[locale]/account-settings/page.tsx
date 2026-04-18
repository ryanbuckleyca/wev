'use client';

import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { getSiteBaseUrl } from '@/lib/site-url';
import { useEffect, useState, useMemo } from 'react';
import notify from '@/lib/toast';
import { usePasswordStrength } from '@/hooks/usePasswordStrength';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';
import PasswordStrengthIndicator from '@/components/PasswordStrengthIndicator';
import LoadingState from '@/components/LoadingState';
import PageLayout from '@/components/PageLayout';
import CardLayout from '@/components/CardLayout';
import Heading from '@/components/Heading';
import FormContainer from '@/components/FormContainer';
import FormField from '@/components/FormField';
import ErrorList from '@/components/ErrorList';
import Button from '@/components/Button';
import DeleteAccountModal from '@/components/DeleteAccountModal';

import { UpdatePasswordSchema, UpdateEmailSchema } from '@/lib/schemas/account';
import { ZodError } from 'zod/v3';

export default function AccountSettingsPage() {
  const t = useTranslations();
  const { user, loading } = useRequireAuth();
  const supabase = useMemo(() => createClient(), []);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [emailError, setEmailError] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [emailChanged, setEmailChanged] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    if (user?.email && !newEmail) {
      setNewEmail(user.email);
    }
  }, [user, newEmail]);

  // Track changes
  useEffect(() => {
    setEmailChanged(user?.email !== newEmail && newEmail !== '');
  }, [user?.email, newEmail]);

  useEffect(() => {
    setPasswordChanged(newPassword !== '' || confirmPassword !== '' || currentPassword !== '');
  }, [newPassword, confirmPassword, currentPassword]);

  const newPasswordStrength = usePasswordStrength(newPassword);

  const validatePasswordForm = (): boolean => {
    const errors: string[] = [];

    try {
      UpdatePasswordSchema.parse({ currentPassword, newPassword });
    } catch (error) {
      if (error instanceof ZodError) {
        error.errors.forEach((err) => {
          if (err.code === 'too_small' && err.path[0] === 'newPassword') {
            errors.push(t('accountSettings.passwordWeak'));
          } else if (err.path[0] === 'currentPassword') {
            errors.push(t('accountSettings.currentPasswordRequired'));
          } else {
            errors.push(err.message);
          }
        });
      }
    }

    if (!confirmPassword) {
      errors.push(t('accountSettings.confirmPasswordRequired'));
    } else if (newPassword !== confirmPassword) {
      errors.push(t('accountSettings.passwordsDontMatch'));
    }

    if (newPassword && (!newPasswordStrength || !newPasswordStrength.isAcceptable)) {
      if (!errors.includes(t('accountSettings.passwordWeak'))) {
        errors.push(t('accountSettings.passwordWeak'));
      }
    }

    setPasswordErrors(errors);
    return errors.length === 0;
  };

  const validateEmailForm = (): boolean => {
    setEmailError('');

    const result = UpdateEmailSchema.safeParse({ email: newEmail });
    if (!result.success) {
      const error = result.error.errors[0];
      setEmailError(error.code === 'invalid_string' ? t('accountSettings.invalidEmailFormat') : error.message);
      return false;
    }

    if (user?.email === newEmail) {
      setEmailError(t('accountSettings.emailMustBeDifferent'));
      return false;
    }

    return true;
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();

    const hasEmailChanges = emailChanged;
    const hasPasswordChanges = passwordChanged;

    if (!hasEmailChanges && !hasPasswordChanges) {
      notify.error(t('accountSettings.noChanges'));
      return;
    }

    // Validate based on what's being changed
    if (hasPasswordChanges && !validatePasswordForm()) {
      return;
    }

    if (hasEmailChanges && !validateEmailForm()) {
      return;
    }

    setIsUpdating(true);

    try {
      let passwordUpdated = false;

      if (hasPasswordChanges) {
        const passwordResponse = await fetch('/api/account', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            currentPassword,
            newPassword,
          }),
        });

        if (!passwordResponse.ok) {
          const body = await passwordResponse.json().catch(() => ({}));
          throw new Error(body.error || t('accountSettings.passwordUpdateFailed'));
        }

        passwordUpdated = true;
      }

      // Update email if changed - use client-side to preserve PKCE flow
      if (hasEmailChanges) {
        const { error: emailError } = await supabase.auth.updateUser(
          { email: newEmail },
          { emailRedirectTo: `${getSiteBaseUrl()}/auth/callback` },
        );

        if (emailError) {
          if (passwordUpdated) {
            notify.success(t('accountSettings.passwordUpdateSuccess'));
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setPasswordErrors([]);
          }
          notify.error(emailError.message || t('accountSettings.emailUpdateFailed'));
          return;
        }
      }

      // Success messages
      if (hasEmailChanges) {
        notify.success(t('accountSettings.emailUpdateSuccess'));
      }

      if (passwordUpdated) {
        notify.success(t('accountSettings.passwordUpdateSuccess'));
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordErrors([]);
      }
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('accountSettings.updateFailed'));
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) {
    return <LoadingState message={t('common.loading')} />;
  }

  if (!user) {
    return null;
  }

  return (
    <PageLayout maxWidth="md">
      <CardLayout>
        <Heading level={1} className="mb-6">
          {t('accountSettings.title')}
        </Heading>

        <FormContainer onSubmit={handleUpdateAccount}>
          <div className="space-y-6">
            {/* Change Email */}
            <div>
              <Heading level={2} className="mb-4">
                {t('accountSettings.emailAddress')}
              </Heading>
              <FormField
                label={t('accountSettings.newEmail')}
                type="email"
                value={newEmail}
                onChange={setNewEmail}
                placeholder={t('accountSettings.newEmailPlaceholder')}
                fullWidth
                error={emailError}
                htmlFor="email"
              />
              <p className="text-sm text-[var(--muted-foreground)] mt-2">
                {t('accountSettings.currentEmail')}{' '}
                <span className="font-semibold">{user.email}</span>
              </p>
            </div>

            <div className="border-t border-[var(--border)]"></div>

            {/* Change Password */}
            <div>
              <Heading level={2} className="mb-4">
                {t('accountSettings.changePassword')}
              </Heading>
              <ErrorList errors={passwordErrors} />

              <FormField
                label={t('accountSettings.currentPassword')}
                type="password"
                value={currentPassword}
                onChange={setCurrentPassword}
                placeholder={t('accountSettings.currentPasswordPlaceholder')}
                fullWidth
                htmlFor="current-password"
                required={passwordChanged}
              />

              <div className="mt-4">
                <FormField
                  label={t('accountSettings.newPassword')}
                  type="password"
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder={t('accountSettings.newPasswordPlaceholder')}
                  fullWidth
                  htmlFor="new-password"
                  required={passwordChanged}
                />
                <PasswordStrengthIndicator passwordStrength={newPasswordStrength} />
              </div>

              <div className="mt-4">
                <FormField
                  label={t('accountSettings.confirmPassword')}
                  type="password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder={t('accountSettings.confirmPasswordPlaceholder')}
                  fullWidth
                  htmlFor="confirm-password"
                  required={passwordChanged}
                />
              </div>
            </div>
          </div>
          {/* Action Buttons */}
          <div className="pt-6 border-t border-[var(--border)]">
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={
                  isUpdating ||
                  (!emailChanged && !passwordChanged) ||
                  (passwordChanged && !newPasswordStrength?.isAcceptable)
                }
                loading={isUpdating}
              >
                {isUpdating ? t('accountSettings.saving') : t('accountSettings.saveChanges')}
              </Button>
            </div>
          </div>
        </FormContainer>

        {/* Delete Account Section */}
        <div className="mt-8 p-6 border border-red-200 dark:border-red-500/40 rounded-lg bg-red-50 dark:bg-red-950/20">
          <Heading level={2} className="mb-4 text-red-600 dark:text-red-400">
            {t('deleteAccount.title')}
          </Heading>
          <p className="text-sm text-red-600/90 dark:text-red-400/90 mb-4">{t('deleteAccount.description')}</p>
          <Button
            onClick={() => setShowDeleteModal(true)}
            disabled={isUpdating}
            className="bg-wev-destructive-tint text-destructive-foreground border-none"
          >
            {t('deleteAccount.button')}
          </Button>
        </div>

        <DeleteAccountModal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} />
      </CardLayout>
    </PageLayout>
  );
}
