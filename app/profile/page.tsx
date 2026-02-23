'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';
import { useProfile } from '@/lib/hooks/useProfile';
import ValuesSelector from '@/components/ValuesSelector';
import LoadingState from '@/components/LoadingState';
import FormInput from '@/components/FormInput';
import FormLabel from '@/components/FormLabel';
import ErrorBox from '@/components/ErrorBox';
import PageLayout from '@/components/PageLayout';
import CardLayout from '@/components/CardLayout';
import Heading from '@/components/Heading';
import Button from '@/components/Button';
import LinkButton from '@/components/LinkButton';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const { user, loading } = useRequireAuth();

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
    return <LoadingState />;
  }

  if (!user) {
    return null;
  }

  if (!profile) {
    return (
      <PageLayout maxWidth="md">
        <CardLayout>
          <Heading level={1} className="mb-4">No Profile Found</Heading>
          <p className="text-[var(--text-secondary)] mb-6">
            Your profile wasn't created. This may happen if you signed up before the profile system was set up.
          </p>
          <LinkButton href="/">
            Back to Jobs
          </LinkButton>
        </CardLayout>
      </PageLayout>
    );
  }

  return (
    <PageLayout maxWidth="md">
      <CardLayout>
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">My Profile</h1>
            <button
              onClick={() => {
                if (isEditing) {
                  handleSaveProfile();
                } else {
                  setIsEditing(true);
                }
              }}
              className="px-4 py-2 text-sm font-medium rounded bg-[var(--primary)] text-white"
            >
              {isEditing ? 'Save Changes' : 'Edit Profile'}
            </button>
          </div>

          {profileError && (
            <ErrorBox>{profileError}</ErrorBox>
          )}

          <div className="space-y-8">
            {/* Profile Photo Section */}
            <div>
              <FormLabel>Profile Photo</FormLabel>
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
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="secondary"
                  >
                    Upload Photo
                  </Button>
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
              <FormLabel htmlFor="full-name">
                Full Name
              </FormLabel>
              {isEditing ? (
                <FormInput
                  type="text"
                  value={formData.full_name}
                  onChange={(value) =>
                    setFormData({ ...formData, full_name: value })
                  }
                  placeholder="Enter your full name"
                  fullWidth
                />
              ) : (
                <p className="text-[var(--text-primary)] bg-[var(--bg)] rounded px-4 py-2 border border-[var(--border)] text-sm">
                  {formData.full_name || '-'}
                </p>
              )}
            </div>

            {/* Bio */}
            <div>
              <FormLabel htmlFor="bio">
                Bio
              </FormLabel>
              {isEditing ? (
                <textarea
                  value={formData.bio}
                  onChange={(e) =>
                    setFormData({ ...formData, bio: e.target.value })
                  }
                  placeholder="Tell us about yourself..."
                  rows={4}
                  className="w-full px-4 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
                />
              ) : (
                <p className="text-[var(--text-primary)] bg-[var(--bg)] rounded px-4 py-2 border border-[var(--border)] text-sm whitespace-pre-wrap">
                  {formData.bio || '-'}
                </p>
              )}
            </div>

            {/* Work Values */}
            <div>
              <FormLabel>Work Values</FormLabel>
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
            <p className="text-sm text-[var(--text-secondary)] mb-3">
              To update your email address or change your password, visit Account Settings.
            </p>
            <LinkButton href="/account-settings">
              Go to Account Settings
            </LinkButton>
          </div>

          <div className="mt-8 pt-8 border-t border-[var(--border)]">
            {isEditing && (
              <Button
                onClick={() => setIsEditing(false)}
                variant="outline"
                className="mr-3"
              >
                Cancel
              </Button>
            )}
            <LinkButton href="/" variant="outline">
              Back to Jobs
            </LinkButton>
          </div>
        </CardLayout>
    </PageLayout>
  );
}
