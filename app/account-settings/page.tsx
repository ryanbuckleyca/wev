'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import toast from 'react-hot-toast';

export default function AccountSettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
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
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      if (session?.user?.email) {
        setNewEmail(session.user.email);
      }
      setLoading(false);
      
      if (!session) {
        router.push('/auth/login');
      }
    }
    checkSession();
  }, [router]);

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
    if (newPassword && newPassword.length < 8) {
      errors.push('New password must be at least 8 characters');
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
      // In a real app, you'd verify the current password first.
      // For now, we'll just use updateUser to set the new password.
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
        // Reset only on success
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
          <h1 className="design-type-h2 text-[var(--text-primary)] mb-8">Account Settings</h1>

          <div className="space-y-8">
            {/* Change Email */}
            <div>
              <h2 className="design-type-h3 text-[var(--text-primary)] mb-4">Email Address</h2>
              <form onSubmit={handleChangeEmail}>
                <div className="mb-4">
                  <label className="block design-type-body font-semibold text-[var(--text-primary)] mb-2">
                    New Email
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="Enter new email"
                    className="w-full px-4 py-2 design-type-body border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
                  />
                  {emailError && (
                    <p className="text-[var(--alert-text)] text-sm mt-2">{emailError}</p>
                  )}
                </div>
                <p className="design-type-body text-[var(--text-secondary)] text-sm mb-4">
                  Current email: <span className="font-semibold">{user.email}</span>
                </p>
                <button
                  type="submit"
                  disabled={isUpdatingEmail}
                  className="design-btn design-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUpdatingEmail ? 'Updating...' : 'Update Email'}
                </button>
              </form>
            </div>

            <div className="border-t border-[var(--border)]"></div>

            {/* Change Password */}
            <div>
              <h2 className="design-type-h3 text-[var(--text-primary)] mb-4">Change Password</h2>
              <form onSubmit={handleChangePassword}>
                {passwordErrors.length > 0 && (
                  <div className="design-toast design-toast-alert mb-4">
                    <ul className="list-disc list-inside">
                      {passwordErrors.map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mb-4">
                  <label className="block design-type-body font-semibold text-[var(--text-primary)] mb-2">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full px-4 py-2 design-type-body border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
                  />
                </div>

                <div className="mb-4">
                  <label className="block design-type-body font-semibold text-[var(--text-primary)] mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (minimum 8 characters)"
                    className="w-full px-4 py-2 design-type-body border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
                  />
                </div>

                <div className="mb-6">
                  <label className="block design-type-body font-semibold text-[var(--text-primary)] mb-2">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full px-4 py-2 design-type-body border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isUpdatingPassword}
                  className="design-btn design-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUpdatingPassword ? 'Updating...' : 'Change Password'}
                </button>
              </form>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-[var(--border)]">
            <Link
              href="/profile"
              className="design-btn design-btn-tertiary inline-block"
            >
              Back to Profile
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
