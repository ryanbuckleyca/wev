'use client';

import { createClient } from '@/lib/supabase/client';
import { useEffect, useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { checkPasswordStrength } from '@/lib/password-strength';
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
import LinkButton from '@/components/LinkButton';

export default function AccountSettingsPage() {
  const { user, loading } = useRequireAuth();
  const supabase = useMemo(() => createClient(), []);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [emailError, setEmailError] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);

  useEffect(() => {
    if (user?.email && !newEmail) {
      setNewEmail(user.email);
    }
  }, [user, newEmail]);

  const newPasswordStrength = useMemo(() => {
    if (!newPassword) return null;
    return checkPasswordStrength(newPassword);
  }, [newPassword]);

  const validatePasswordForm = (): boolean => {
    const errors: string[] = [];
    
    if (!currentPassword) {
      errors.push('Current password is required');
    }
    if (!newPassword) {
      errors.push('New password is required');
    }
    if (!confirmPassword) {
      errors.push('Password confirmation is required');
    }
    if (newPassword !== confirmPassword) {
      errors.push('Passwords do not match');
    }
    if (newPassword && (!newPasswordStrength || !newPasswordStrength.isAcceptable)) {
      errors.push('New password is too weak. Please choose a stronger password.');
    }
    
    setPasswordErrors(errors);
    return errors.length === 0;
  };

  const validateEmailForm = (): boolean => {
    setEmailError('');
    
    if (!newEmail) {
      setEmailError('Email is required');
      return false;
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      setEmailError('Invalid email format');
      return false;
    }
    
    if (user?.email === newEmail) {
      setEmailError('New email must be different from current email');
      return false;
    }
    
    return true;
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validatePasswordForm()) {
      return;
    }

    setIsUpdatingPassword(true);
    
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        toast.error(error.message || 'Failed to update password');
      } else {
        toast.success('Password updated successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateEmailForm()) {
      return;
    }

    setIsUpdatingEmail(true);
    
    try {
      const { error } = await supabase.auth.updateUser({
        email: newEmail,
      });

      if (error) {
        toast.error(error.message || 'Failed to update email');
      } else {
        toast.success('Confirmation email sent to your new address. Please verify it to complete the change.');
        setNewEmail(newEmail);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update email');
    } finally {
      setIsUpdatingEmail(false);
    }
  };

  if (loading) {
    return <LoadingState />;
  }

  if (!user) {
    return null;
  }

  return (
    <PageLayout maxWidth="md">
      <CardLayout>
        <Heading level={1} className="mb-8">Account Settings</Heading>

          <div className="space-y-8">
            {/* Change Email */}
            <div>
              <Heading level={2} className="mb-4">Email Address</Heading>
              <FormContainer onSubmit={handleChangeEmail}>
                <FormField
                  label="New Email"
                  type="email"
                  value={newEmail}
                  onChange={setNewEmail}
                  placeholder="Enter new email"
                  fullWidth
                  error={emailError}
                  htmlFor="email"
                />
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  Current email: <span className="font-semibold">{user.email}</span>
                </p>
                <div className="flex justify-start">
                  <Button
                    type="submit"
                    disabled={isUpdatingEmail}
                    loading={isUpdatingEmail}
                  >
                    Update Email
                  </Button>
                </div>
              </FormContainer>
            </div>

            <div className="border-t border-[var(--border)]"></div>

            {/* Change Password */}
            <div>
              <Heading level={2} className="mb-4">Change Password</Heading>
              <FormContainer onSubmit={handleChangePassword}>
                <ErrorList errors={passwordErrors} />

                <FormField
                  label="Current Password"
                  type="password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  placeholder="Enter current password"
                  fullWidth
                  htmlFor="current-password"
                />

                <FormField
                  label="New Password"
                  type="password"
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder="Enter new password"
                  fullWidth
                  htmlFor="new-password"
                />
                <PasswordStrengthIndicator passwordStrength={newPasswordStrength} />

                <FormField
                  label="Confirm Password"
                  type="password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Confirm new password"
                  fullWidth
                  htmlFor="confirm-password"
                />

                <div className="flex justify-start">
                  <Button
                    type="submit"
                    disabled={isUpdatingPassword || !newPasswordStrength?.isAcceptable}
                    loading={isUpdatingPassword}
                  >
                    Change Password
                  </Button>
                </div>
              </FormContainer>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-[var(--border)]">
            <LinkButton href="/profile">
              Back to Profile
            </LinkButton>
          </div>
        </CardLayout>
    </PageLayout>
  );
}
