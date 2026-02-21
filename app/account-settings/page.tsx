'use client';

import { createClient } from '@/lib/supabase/client';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { checkPasswordStrength } from '@/lib/password-strength';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';

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
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <p className="text-[var(--text-secondary)]">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] pt-24">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8">
          <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-8">Account Settings</h1>

          <div className="space-y-8">
            {/* Change Email */}
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Email Address</h2>
              <form onSubmit={handleChangeEmail}>
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">
                    New Email
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="Enter new email"
                    className="w-full px-4 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
                  />
                  {emailError && (
                    <p className="text-[var(--alert-text)] text-sm mt-2">{emailError}</p>
                  )}
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  Current email: <span className="font-semibold">{user.email}</span>
                </p>
                <button
                  type="submit"
                  disabled={isUpdatingEmail}
                  className="px-4 py-2 text-sm font-medium rounded bg-[var(--primary)] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUpdatingEmail ? 'Updating...' : 'Update Email'}
                </button>
              </form>
            </div>

            <div className="border-t border-[var(--border)]"></div>

            {/* Change Password */}
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Change Password</h2>
              <form onSubmit={handleChangePassword}>
                {passwordErrors.length > 0 && (
                  <div className="mb-4 p-3 rounded bg-[var(--alert-tint)] text-[var(--alert-text)] text-sm">
                    <ul className="list-disc list-inside">
                      {passwordErrors.map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mb-4">
                  <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full px-4 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full px-4 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
                  />

                  {newPasswordStrength && (
                    <div className="mt-3">
                      <div className="flex gap-1 mb-2">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className="flex-1 h-2 rounded-full transition-colors"
                            style={{
                              backgroundColor:
                                i <= newPasswordStrength.score
                                  ? newPasswordStrength.color
                                  : 'var(--border)',
                            }}
                          />
                        ))}
                      </div>

                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs">
                          Strength:{' '}
                          <span style={{ color: newPasswordStrength.color }} className="font-semibold">
                            {newPasswordStrength.label}
                          </span>
                        </span>
                        {newPasswordStrength.isAcceptable && (
                          <span className="text-xs text-[var(--success-solid)]">
                            ✓ Acceptable
                          </span>
                        )}
                      </div>

                      {newPasswordStrength.feedback && !newPasswordStrength.isAcceptable && (
                        <p className="text-xs text-[var(--warn-solid)]">
                          {newPasswordStrength.feedback}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full px-4 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isUpdatingPassword || !newPasswordStrength?.isAcceptable}
                  className="px-4 py-2 text-sm font-medium rounded bg-[var(--primary)] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUpdatingPassword ? 'Updating...' : 'Change Password'}
                </button>
              </form>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-[var(--border)]">
            <Link
              href="/profile"
              className="inline-block px-4 py-2 text-sm font-medium rounded border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg)]"
            >
              Back to Profile
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
