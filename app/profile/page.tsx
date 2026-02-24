'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';
import { useProfile } from '@/lib/hooks/useProfile';
import ValuesSelector from '@/components/ValuesSelector';
import LoadingState from '@/components/LoadingState';
import FormContainer from '@/components/FormContainer';
import FormField from '@/components/FormField';
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

  const [isSaving, setIsSaving] = useState(false);
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
    setIsSaving(true);
    try {
      const updated = await updateProfile({
        full_name: formData.full_name || null,
        bio: formData.bio || null,
        values: formData.values,
      });

      if (updated) {
        toast.success('Profile updated successfully!');
      } else {
        toast.error(profileError || 'Failed to update profile');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setIsSaving(false);
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
        <Heading level={1} className="mb-6">My Profile</Heading>

        {profileError && (
          <ErrorBox>{profileError}</ErrorBox>
        )}

        <FormContainer onSubmit={handleSaveProfile}>
          <div className="space-y-6">
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
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="secondary"
                  type="button"
                >
                  Upload Photo
                </Button>
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
            <FormField
              label="Full Name"
              type="text"
              value={formData.full_name}
              onChange={(value) =>
                setFormData({ ...formData, full_name: value })
              }
              placeholder="Enter your full name"
              fullWidth
              htmlFor="full-name"
            />

            {/* Bio */}
            <div>
              <FormLabel htmlFor="bio">Bio</FormLabel>
              <textarea
                id="bio"
                value={formData.bio}
                onChange={(e) =>
                  setFormData({ ...formData, bio: e.target.value })
                }
                placeholder="Tell us about yourself..."
                rows={4}
                className="w-full px-4 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
              />
            </div>

            {/* Work Values */}
            <div>
              <FormLabel>Work Values</FormLabel>
              <ValuesSelector
                selectedValues={formData.values}
                onValuesChange={(values) =>
                  setFormData({ ...formData, values })
                }
                isEditing={true}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-6 border-t border-[var(--border)]">
            <div className="flex justify-between gap-3">
              <LinkButton href="/" variant="outline">
                Back to Jobs
              </LinkButton>
              <Button
                type="submit"
                disabled={isSaving}
                loading={isSaving}
              >
                Save Profile
              </Button>
            </div>
          </div>
        </FormContainer>

        {/* Account Settings Info */}
        <div className="bg-[var(--bg)] p-4 rounded-lg mt-6">
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            To update your email address or change your password, visit Account Settings.
          </p>
          <Link href="/account-settings" className="text-[var(--primary)] hover:underline visited:text-[var(--accent)]" prefetch={true}>
            Go to Account Settings
          </Link>
        </div>
        </CardLayout>
    </PageLayout>
  );
}
