import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import {
  useProfileFilterDefaults,
  type ProfileFilterSeed,
  type ProfileFilterCurrent,
  type ProfileFilterSetters,
} from './useProfileFilterDefaults';

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(),
}));

function mockUrlParams(present: string[]) {
  const set = new Set(present);
  vi.mocked(useSearchParams).mockReturnValue({
    has: (key: string) => set.has(key),
  } as any);
}

const emptySeed: ProfileFilterSeed = {
  workTypes: [],
  province: null,
  municipality: null,
  languages: [],
};

const emptyCurrent: ProfileFilterCurrent = {
  workTypes: [],
  provinces: [],
  municipalities: [],
  languages: [],
};

function makeSetters(): ProfileFilterSetters {
  return {
    setWorkTypes: vi.fn(),
    setProvinces: vi.fn(),
    setMunicipalities: vi.fn(),
    setLanguages: vi.fn(),
  };
}

describe('useProfileFilterDefaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUrlParams([]);
  });

  it('is ready and seeds nothing for an anonymous user', () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useProfileFilterDefaults({
        enabled: false,
        resolved: true,
        seed: {
          workTypes: ['remote'],
          province: 'QC',
          municipality: 'Montreal',
          languages: ['en'],
        },
        current: emptyCurrent,
        setters,
      }),
    );

    expect(result.current).toBe(true);
    expect(setters.setWorkTypes).not.toHaveBeenCalled();
    expect(setters.setProvinces).not.toHaveBeenCalled();
    expect(setters.setLanguages).not.toHaveBeenCalled();
  });

  it('waits (not ready) while a logged-in user profile is still loading', () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useProfileFilterDefaults({
        enabled: true,
        resolved: false,
        seed: { workTypes: ['remote'], province: null, municipality: null, languages: [] },
        current: emptyCurrent,
        setters,
      }),
    );

    expect(result.current).toBe(false);
    expect(setters.setWorkTypes).not.toHaveBeenCalled();
  });

  it('seeds profile defaults once, then becomes ready when the seed lands', () => {
    const setters = makeSetters();
    const seed: ProfileFilterSeed = {
      workTypes: ['remote', 'hybrid'],
      province: 'QC',
      municipality: 'Montreal',
      languages: ['en'],
    };

    const { result, rerender } = renderHook(
      ({ current }: { current: ProfileFilterCurrent }) =>
        useProfileFilterDefaults({ enabled: true, resolved: true, seed, current, setters }),
      { initialProps: { current: emptyCurrent } },
    );

    // Seed applied, but not yet reflected in `current` → still not ready.
    expect(setters.setWorkTypes).toHaveBeenCalledWith(['remote', 'hybrid']);
    expect(setters.setProvinces).toHaveBeenCalledWith(['QC']);
    expect(setters.setMunicipalities).toHaveBeenCalledWith(['Montreal']);
    expect(setters.setLanguages).toHaveBeenCalledWith(['en']);
    expect(result.current).toBe(false);

    // URL now reflects the seed.
    rerender({
      current: {
        workTypes: ['remote', 'hybrid'],
        provinces: ['QC'],
        municipalities: ['Montreal'],
        languages: ['en'],
      },
    });

    expect(result.current).toBe(true);
  });

  it('does not re-seed after the user clears a seeded filter', () => {
    const setters = makeSetters();
    const seed: ProfileFilterSeed = {
      workTypes: ['remote'],
      province: null,
      municipality: null,
      languages: [],
    };

    const { result, rerender } = renderHook(
      ({ current }: { current: ProfileFilterCurrent }) =>
        useProfileFilterDefaults({ enabled: true, resolved: true, seed, current, setters }),
      { initialProps: { current: emptyCurrent } },
    );

    // Seed lands.
    rerender({ current: { ...emptyCurrent, workTypes: ['remote'] } });
    expect(result.current).toBe(true);
    expect(setters.setWorkTypes).toHaveBeenCalledTimes(1);

    // User clears the filter → selection empty again.
    rerender({ current: emptyCurrent });

    // Still ready, and the profile default is NOT re-applied.
    expect(result.current).toBe(true);
    expect(setters.setWorkTypes).toHaveBeenCalledTimes(1);
  });

  it('does not seed a dimension that is already present in the URL', () => {
    mockUrlParams(['workType']);
    const setters = makeSetters();

    renderHook(() =>
      useProfileFilterDefaults({
        enabled: true,
        resolved: true,
        seed: { workTypes: ['remote'], province: 'QC', municipality: null, languages: [] },
        current: { ...emptyCurrent, workTypes: ['office'] },
        setters,
      }),
    );

    // workType present in URL → not seeded; province absent → seeded.
    expect(setters.setWorkTypes).not.toHaveBeenCalled();
    expect(setters.setProvinces).toHaveBeenCalledWith(['QC']);
  });

  it('is ready immediately with no seeding when all dimensions are in the URL', () => {
    mockUrlParams(['workType', 'province', 'municipality', 'lang']);
    const setters = makeSetters();

    const { result } = renderHook(() =>
      useProfileFilterDefaults({
        enabled: true,
        resolved: true,
        seed: {
          workTypes: ['remote'],
          province: 'QC',
          municipality: 'Montreal',
          languages: ['en'],
        },
        current: {
          workTypes: ['office'],
          provinces: ['ON'],
          municipalities: ['Toronto'],
          languages: ['fr'],
        },
        setters,
      }),
    );

    expect(result.current).toBe(true);
    expect(setters.setWorkTypes).not.toHaveBeenCalled();
    expect(setters.setProvinces).not.toHaveBeenCalled();
    expect(setters.setMunicipalities).not.toHaveBeenCalled();
    expect(setters.setLanguages).not.toHaveBeenCalled();
  });
});
