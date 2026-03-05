'use client';

import Link from '@/i18n/navigation';
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

export default function AccountSettingsPage() {
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

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const hasEmailChanges = emailChanged;
    const hasPasswordChanges = passwordChanged;
    
    if (!hasEmailChanges && !hasPasswordChanges) {
      toast.error('No changes to save');
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
          toast.error(emailError.message || 'Failed to update email');
          return;
        }
      }

      // Update password if changed
      if (hasPasswordChanges) {
        const { error: passwordError } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (passwordError) {
          toast.error(passwordError.message || 'Failed to update password');
          return;
        }
      }

      // Success messages
      if (hasEmailChanges) {
        toast.success('Confirmation email sent to your new address. Please verify it to complete the change.');
      }
      
      if (hasPasswordChanges) {
        toast.success('Password updated successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
      
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update account');
    } finally {
      setIsUpdating(false);
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
        <Heading level={1} className="mb-6">Account Settings</Heading>

        <FormContainer onSubmit={handleUpdateAccount}>
          <div className="space-y-6">
            {/* Change Email */}
            <div>
              <Heading level={2} className="mb-4">Email Address</Heading>
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
              <p className="text-sm text-[var(--text-secondary)] mt-2">
                Current email: <span className="font-semibold">{user.email}</span>
              </p>
            </div>

            <div className="border-t border-[var(--border)]"></div>

            {/* Change Password */}
            <div>
              <Heading level={2} className="mb-4">Change Password</Heading>
              <ErrorList errors={passwordErrors} />

              <FormField
                label="Current Password"
                type="password"
                value={currentPassword}
                onChange={setCurrentPassword}
                placeholder="Enter current password"
                fullWidth
                htmlFor="current-password"
                required={passwordChanged}
              />

              <FormField
                label="New Password"
                type="password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Enter new password"
                fullWidth
                htmlFor="new-password"
                required={passwordChanged}
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
                required={passwordChanged}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-6 border-t border-[var(--border)]">
            <div className="flex justify-between gap-3">
              <Link href="/profile" className="text-[var(--primary)] hover:underline visited:text-[var(--accent)]" prefetch={true}>
                Back to Profile
              </Link>
              <Button
                type="submit"
                disabled={isUpdating || (!emailChanged && !passwordChanged) || (passwordChanged && !newPasswordStrength?.isAcceptable)}
                loading={isUpdating}
              >
                {isUpdating ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>  
            {!emailChanged && !passwordChanged && (
              <p className="text-sm text-[var(--text-secondary)] mt-2">
                Make changes above to enable saving
              </p>
            )}
        </FormContainer>
        </CardLayout>
    </PageLayout>
  );
}
