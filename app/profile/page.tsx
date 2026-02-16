'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { useProfile } from '@/lib/hooks/useProfile';
import ValuesSelector from '@/components/ValuesSelector';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setLoading(false);
      
      if (!session) {
        router.push('/auth/login');
      }
    }
    checkSession();
  }, [router]);

  const { profile, loading: profileLoading, error: profileError, updateProfile, uploadPhoto } = useProfile(user?.id);

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    bio: '',
    values: [] as string[],
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update form data when profile loads
  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || '',
        bio: profile.bio || '',
        values: profile.values || [],
      });
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    try {
      const updated = await updateProfile({
        full_name: formData.full_name || null,
        bio: formData.bio || null,
        values: formData.values,
      });
      
      if (updated) {
        toast.success('Profile updated successfully!');
        setIsEditing(false);
      } else {
        toast.error(profileError || 'Failed to update profile');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile');
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await uploadPhoto(file);
      toast.success('Photo uploaded successfully!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload photo');
    }
  };

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <p className="text-[var(--text-secondary)]">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[var(--bg)] pt-24">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8">
            <h1 className="design-type-h2 text-[var(--text-primary)] mb-4">No Profile Found</h1>
            <p className="design-type-body text-[var(--text-secondary)] mb-6">
              Your profile wasn't created. This may happen if you signed up before the profile system was set up.
            </p>
            <Link
              href="/"
              className="design-btn design-btn-primary inline-block"
            >
              Back to Jobs
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] pt-24">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8">
          <div className="flex justify-between items-center mb-8">
            <h1 className="design-type-h2 text-[var(--text-primary)]">My Profile</h1>
            <button
              onClick={() => {
                if (isEditing) {
                  handleSaveProfile();
                } else {
                  setIsEditing(true);
                }
              }}
              className="design-btn design-btn-primary"
            >
              {isEditing ? 'Save Changes' : 'Edit Profile'}
            </button>
          </div>

          {profileError && (
            <div className="design-toast design-toast-alert mb-6">
              {profileError}
            </div>
          )}

          <div className="space-y-8">
            {/* Profile Photo Section */}
            <div>
              <label className="block design-type-body font-semibold text-[var(--text-primary)] mb-4">
                Profile Photo
              </label>
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-lg bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center flex-shrink-0">
                  {profile.profile_photo_url ? (
                    <img
                      src={profile.profile_photo_url}
                      alt="Profile"
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <span className="text-3xl font-bold text-[var(--text-secondary)]">
                      {user.email?.[0].toUpperCase()}
                    </span>
                  )}
                </div>
                {isEditing && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="design-btn design-btn-secondary"
                  >
                    Upload Photo
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </div>
            </div>

            {/* Full Name */}
            <div>
              <label className="block design-type-body font-semibold text-[var(--text-primary)] mb-2">
                Full Name
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) =>
                    setFormData({ ...formData, full_name: e.target.value })
                  }
                  placeholder="Enter your full name"
                  className="w-full px-4 py-2 design-type-body border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
                />
              ) : (
                <p className="text-[var(--text-primary)] bg-[var(--bg)] rounded px-4 py-2 border border-[var(--border)] design-type-body">
                  {formData.full_name || '-'}
                </p>
              )}
            </div>

            {/* Bio */}
            <div>
              <label className="block design-type-body font-semibold text-[var(--text-primary)] mb-2">
                Bio
              </label>
              {isEditing ? (
                <textarea
                  value={formData.bio}
                  onChange={(e) =>
                    setFormData({ ...formData, bio: e.target.value })
                  }
                  placeholder="Tell us about yourself..."
                  rows={4}
                  className="w-full px-4 py-2 design-type-body border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
                />
              ) : (
                <p className="text-[var(--text-primary)] bg-[var(--bg)] rounded px-4 py-2 border border-[var(--border)] design-type-body whitespace-pre-wrap">
                  {formData.bio || '-'}
                </p>
              )}
            </div>

            {/* Work Values */}
            <div>
              <label className="block design-type-body font-semibold text-[var(--text-primary)] mb-3">
                Work Values
              </label>
              <ValuesSelector
                selectedValues={formData.values}
                onValuesChange={(values) =>
                  setFormData({ ...formData, values })
                }
                isEditing={isEditing}
              />
            </div>
          </div>

          {/* Account Settings Info */}
          <div className="mt-8 pt-8 border-t border-[var(--border)] bg-[var(--bg)] p-4 rounded-lg">
            <p className="design-type-body text-[var(--text-secondary)] mb-3">
              To update your email address or change your password, visit Account Settings.
            </p>
            <Link
              href="/account-settings"
              className="design-btn design-btn-secondary inline-block"
            >
              Go to Account Settings
            </Link>
          </div>

          <div className="mt-8 pt-8 border-t border-[var(--border)]">
            {isEditing && (
              <button
                onClick={() => setIsEditing(false)}
                className="design-btn design-btn-tertiary mr-3"
              >
                Cancel
              </button>
            )}
            <Link
              href="/"
              className="design-btn design-btn-tertiary inline-block"
            >
              Back to Jobs
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
