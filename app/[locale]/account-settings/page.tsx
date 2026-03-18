'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState, useMemo } from 'react';
import toast from 'react-hot-toast';
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

  // Map Supabase error messages to translation keys
  const mapErrorToTranslationKey = (error: string): string => {
    if (error.toLowerCase().includes('new password should be different from old password')) {
      return t('accountSettings.passwordSameAsOld');
    }
    if (error.toLowerCase().includes('weak password')) {
      return t('accountSettings.passwordWeak');
    }
    // Default to generic error
    return t('accountSettings.passwordUpdateFailed');
  };

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
    
    if (!currentPassword) {
      errors.push(t('accountSettings.currentPasswordRequired'));
    }
    if (!newPassword) {
      errors.push(t('accountSettings.newPasswordRequired'));
    }
    if (!confirmPassword) {
      errors.push(t('accountSettings.confirmPasswordRequired'));
    }
    if (newPassword !== confirmPassword) {
      errors.push(t('accountSettings.passwordsDontMatch'));
    }
    if (newPassword && (!newPasswordStrength || !newPasswordStrength.isAcceptable)) {
      errors.push(t('accountSettings.passwordWeak'));
    }
    
    setPasswordErrors(errors);
    return errors.length === 0;
  };

  const validateEmailForm = (): boolean => {
    setEmailError('');
    
    if (!newEmail) {
      setEmailError(t('accountSettings.emailRequired'));
      return false;
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      setEmailError(t('accountSettings.invalidEmailFormat'));
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
      toast.error(t('accountSettings.noChanges'));
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
      // Update email if changed
      if (hasEmailChanges) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: newEmail,
        });

        if (emailError) {
          toast.error(emailError.message || t('accountSettings.emailUpdateFailed'));
          return;
        }
      }

      // Update password if changed
      if (hasPasswordChanges) {
        const { error: passwordError } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (passwordError) {
          toast.error(passwordError.message || t('accountSettings.passwordUpdateFailed'));
          return;
        }
      }

      // Success messages
      if (hasEmailChanges) {
        toast.success(t('accountSettings.emailUpdateSuccess'));
      }
      
      if (hasPasswordChanges) {
        toast.success(t('accountSettings.passwordUpdateSuccess'));
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
      
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('accountSettings.updateFailed'));
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
        <Heading level={1} className="mb-6">{t('accountSettings.title')}</Heading>

        <FormContainer onSubmit={handleUpdateAccount}>
          <div className="space-y-6">
            {/* Change Email */}
            <div>
              <Heading level={2} className="mb-4">{t('accountSettings.emailAddress')}</Heading>
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
                {t('accountSettings.currentEmail')} <span className="font-semibold">{user.email}</span>
              </p>
            </div>

            <div className="border-t border-[var(--border)]"></div>

            {/* Change Password */}
            <div>
              <Heading level={2} className="mb-4">{t('accountSettings.changePassword')}</Heading>
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
                disabled={isUpdating || (!emailChanged && !passwordChanged) || (passwordChanged && !newPasswordStrength?.isAcceptable)}
                loading={isUpdating}
              >
                {isUpdating ? t('accountSettings.saving') : t('accountSettings.saveChanges')}
              </Button>
            </div>
          </div>
        </FormContainer>

        {/* Delete Account Section */}
        <div className="mt-8 p-6 border border-red-200 rounded-lg bg-red-50">
          <Heading level={2} className="mb-4 text-red-800">{t('deleteAccount.title')}</Heading>
          <p className="text-sm text-red-700 mb-4">
            {t('deleteAccount.description')}
          </p>
          <Button
            onClick={() => setShowDeleteModal(true)}
            disabled={isUpdating}
            className="bg-wev-destructive-tint text-destructive-foreground border-none"
          >
            {t('deleteAccount.button')}
          </Button>
        </div>

        <DeleteAccountModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
        />
        </CardLayout>
    </PageLayout>
  );
}
