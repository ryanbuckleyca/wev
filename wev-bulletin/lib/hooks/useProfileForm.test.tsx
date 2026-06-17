import { renderHook, act, waitFor } from '@testing-library/react';
import { useProfileForm } from './useProfileForm';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProfile } from '@/contexts/ProfileContext';
import { fetchSkillsByUri } from '@/lib/skills/client';
import notify from '@/lib/toast';
import { useUnsavedChangesWarning } from '@/lib/hooks/useUnsavedChangesWarning';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/contexts/ProfileContext', () => ({
  useProfile: vi.fn(),
}));

vi.mock('@/lib/skills/client', () => ({
  fetchSkillsByUri: vi.fn(),
}));

vi.mock('@/lib/toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/hooks/useUnsavedChangesWarning', () => ({
  useUnsavedChangesWarning: vi.fn(),
}));

describe('useProfileForm', () => {
  const mockUpdateProfile = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useProfile).mockReturnValue({
      profile: null,
      loading: false,
      error: null,
      updateProfile: mockUpdateProfile,
    } as any);
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  it('hydrates from profile with rated values', async () => {
    const profile = {
      id: 'u1',
      updated_at: '2024-01-01',
      values_rated: [
        { value: 'V1', rank: 1 },
        { value: 'V2', rank: null },
      ],
    };
    vi.mocked(useProfile).mockReturnValue({
      profile,
      loading: false,
      error: null,
      updateProfile: mockUpdateProfile,
    } as any);

    const { result } = renderHook(() => useProfileForm('en'));

    await waitFor(() => {
      expect(result.current.selectedValues).toEqual(['V1', 'V2']);
    });

    expect(result.current.valueCutoff).toBe(1);
  });

  it('handles skill reorder and remove', async () => {
    const profile = {
      id: 'u1',
      updated_at: '2024-01-01',
      skills: ['s1', 's2'],
    };
    vi.mocked(useProfile).mockReturnValue({
      profile,
      loading: false,
      error: null,
      updateProfile: mockUpdateProfile,
    } as any);
    vi.mocked(fetchSkillsByUri).mockResolvedValue([
      { uri: 's1', label: 'S1' },
      { uri: 's2', label: 'S2' },
    ] as any);

    const { result } = renderHook(() => useProfileForm('en'));

    await waitFor(() => {
      expect(result.current.selectedSkills).toHaveLength(2);
    });

    act(() => {
      result.current.handleSkillReorder(1, 0);
    });
    expect(result.current.selectedSkills[0].uri).toBe('s2');

    act(() => {
      result.current.handleSkillRemove('s2');
    });
    expect(result.current.selectedSkills).toHaveLength(1);
  });

  it('hydrates from profile', async () => {
    const profile = {
      id: 'u1',
      full_name: 'John Doe',
      bio: 'Developer',
      updated_at: '2024-01-01',
      skills: ['uri1'],
      values: ['Ambition'],
    };
    vi.mocked(useProfile).mockReturnValue({
      profile,
      loading: false,
      error: null,
      updateProfile: mockUpdateProfile,
    } as any);
    vi.mocked(fetchSkillsByUri).mockResolvedValue([
      { uri: 'uri1', preferredLabel: { en: 'Skill 1', fr: 'Skill 1' } },
    ] as any);

    const { result } = renderHook(() => useProfileForm('en'));

    // Wait for hydration effect
    await waitFor(
      () => {
        expect(result.current.selectedSkills).toHaveLength(1);
      },
      { timeout: 5000 },
    );

    expect(result.current.formData.full_name).toBe('John Doe');
    expect(result.current.selectedValues).toEqual(['Ambition']);
    expect(result.current.selectedSkills).toEqual([
      { uri: 'uri1', preferredLabel: { en: 'Skill 1', fr: 'Skill 1' } },
    ]);
  });

  it('handles work type toggle', () => {
    const { result } = renderHook(() => useProfileForm('en'));

    act(() => {
      result.current.handleWorkTypeToggle('remote');
    });
    expect(result.current.formData.work_types).toEqual(['remote']);

    act(() => {
      result.current.handleWorkTypeToggle('remote');
    });
    expect(result.current.formData.work_types).toEqual([]);
  });

  it('saves profile successfully', async () => {
    const { result } = renderHook(() => useProfileForm('en'));
    mockUpdateProfile.mockResolvedValue({ ok: true });

    await act(async () => {
      await result.current.handleSaveProfile();
    });

    expect(mockUpdateProfile).toHaveBeenCalled();
    expect(notify.success).toHaveBeenCalledWith('updateSuccess');
  });

  it('marks the form dirty after editing and clean after save', async () => {
    let profileState = {
      id: 'u1',
      full_name: 'John Doe',
      bio: 'Developer',
      updated_at: '2024-01-01',
      skills: [],
      values: ['Ambition'],
      work_types: [],
      preferred_languages: [],
    };
    let rerenderHook: (() => void) | undefined;

    vi.mocked(useProfile).mockImplementation(
      () =>
        ({
          profile: profileState,
          loading: false,
          error: null,
          updateProfile: mockUpdateProfile,
        }) as never,
    );

    mockUpdateProfile.mockImplementation(async (data) => {
      profileState = {
        ...profileState,
        full_name: data.full_name ?? profileState.full_name,
        updated_at: '2024-01-02',
      };
      rerenderHook?.();
      return profileState;
    });

    const { result, rerender } = renderHook(() => useProfileForm('en'));
    rerenderHook = rerender;

    await waitFor(() => {
      expect(useUnsavedChangesWarning).toHaveBeenLastCalledWith(false, 'unsavedChangesWarning');
    });

    act(() => {
      result.current.setFormData((prev) => ({ ...prev, full_name: 'Jane Doe' }));
    });

    await waitFor(() => {
      expect(useUnsavedChangesWarning).toHaveBeenLastCalledWith(true, 'unsavedChangesWarning');
    });

    await act(async () => {
      await result.current.handleSaveProfile();
    });

    await waitFor(() => {
      expect(useUnsavedChangesWarning).toHaveBeenLastCalledWith(false, 'unsavedChangesWarning');
    });
  });

  it('handles CV import', () => {
    const { result } = renderHook(() => useProfileForm('en'));
    const importedSkills = [{ uri: 'uri2', label: 'Skill 2' }] as any;
    const importedValues = ['Integrity'];
    const cvImport = { id: 'import-1' } as any;

    act(() => {
      result.current.handleApplyCvImport({
        skills: importedSkills,
        values: importedValues,
        cvImport,
        warnings: [],
      });
    });

    expect(result.current.selectedSkills).toEqual(importedSkills);
    expect(result.current.selectedValues).toEqual(importedValues);
    expect(result.current.formData.cv_import).toEqual(cvImport);
  });
});
