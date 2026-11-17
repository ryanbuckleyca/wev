import { useState, useEffect, useCallback } from 'react';
import { generateSlug } from '@/lib/slug';
import type { LocationSelection } from '@/components/profile/LocationAutocomplete';
import type { OrgRecord } from '@/lib/organizations/types';
import { normalizeOrgType } from '@/lib/organizations/org-type';
import {
  EXCLUDED_SUBTYPE,
  isGovernanceSubtype,
} from '@/lib/organizations/governance-taxonomy';
import type { OrgFormInput } from '@/lib/organizations/validate';

function initialLocation(initialValues?: Partial<OrgRecord>): {
  selection: LocationSelection | null;
  hasCoords: boolean;
} {
  if (!initialValues) return { selection: null, hasCoords: false };

  const displayName = initialValues.location?.trim() || null;
  const lat = initialValues.lat;
  const lng = initialValues.lng;
  if (displayName && lat != null && lng != null) {
    return {
      hasCoords: true,
      selection: {
        name: initialValues.municipality?.trim() || displayName,
        province: initialValues.province?.trim() || '',
        display_name: displayName,
        lat,
        lng,
      },
    };
  }

  if (displayName) {
    return {
      hasCoords: false,
      selection: {
        name: initialValues.municipality?.trim() || displayName,
        province: initialValues.province?.trim() || '',
        display_name: displayName,
        lat: 0,
        lng: 0,
      },
    };
  }

  return { selection: null, hasCoords: false };
}

export function useOrgAdminFormState(initialValues?: Partial<OrgRecord>) {
  const isEditMode = Boolean(initialValues?.id);
  const initialLocationState = initialLocation(initialValues);

  const [name, setName] = useState(initialValues?.name || '');
  const [slug, setSlug] = useState(initialValues?.slug || '');
  const [descriptionEn, setDescriptionEn] = useState(
    initialValues?.description_en || initialValues?.description || '',
  );
  const [descriptionFr, setDescriptionFr] = useState(initialValues?.description_fr || '');
  const [missionStatementEn, setMissionStatementEn] = useState(
    initialValues?.mission_statement_en || initialValues?.mission_statement || '',
  );
  const [missionStatementFr, setMissionStatementFr] = useState(
    initialValues?.mission_statement_fr || '',
  );
  const [website, setWebsite] = useState(initialValues?.website || '');
  const [location, setLocation] = useState<LocationSelection | null>(
    initialLocationState.selection,
  );
  const [locationHasCoords, setLocationHasCoords] = useState(initialLocationState.hasCoords);
  const [type, setType] = useState(() => normalizeOrgType(initialValues?.type) || '');
  const [governanceSubtype, setGovernanceSubtype] = useState(() => {
    const raw = initialValues?.governance_subtype?.trim() || '';
    return raw && isGovernanceSubtype(raw) ? raw : '';
  });
  const [sectorId, setSectorId] = useState(initialValues?.sector_id || '');
  const [isSse, setIsSse] = useState(initialValues?.is_sse ?? false);
  const [language, setLanguage] = useState(initialValues?.language || '');
  const [valuesList, setValuesList] = useState<string[]>(initialValues?.values_list ?? []);
  const [valueCutoff, setValueCutoff] = useState(valuesList.length);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(Boolean(initialValues?.slug));

  useEffect(() => {
    if (!isEditMode && name && !slugManuallyEdited) {
      setSlug(generateSlug(name));
    }
  }, [name, isEditMode, slugManuallyEdited]);

  useEffect(() => {
    setValueCutoff(valuesList.length);
  }, [valuesList.length]);

  // Keep governance coherent with the SSE gate: non-SSE → EXCLUDED; flipping
  // back to SSE clears EXCLUDED so the admin must pick a real subtype.
  const setIsSseAndReconcileGovernance = useCallback((next: boolean) => {
    setIsSse(next);
    setGovernanceSubtype((prev) => {
      if (!next) return EXCLUDED_SUBTYPE;
      return prev === EXCLUDED_SUBTYPE ? '' : prev;
    });
  }, []);

  const setLocationSelection = useCallback(
    (value: LocationSelection | null, hasCoords: boolean) => {
      setLocation(value);
      setLocationHasCoords(hasCoords);
    },
    [],
  );

  const buildFormInput = useCallback((): OrgFormInput => {
    const hasCoords = Boolean(location && locationHasCoords);
    return {
      name: name.trim(),
      slug: slug.trim(),
      description_en: descriptionEn.trim() || null,
      description_fr: descriptionFr.trim() || null,
      mission_statement_en: missionStatementEn.trim() || null,
      mission_statement_fr: missionStatementFr.trim() || null,
      website: website.trim() || null,
      location: location?.display_name?.trim() || null,
      municipality: hasCoords ? location?.name?.trim() || null : null,
      province: hasCoords ? location?.province?.trim() || null : null,
      lat: hasCoords ? location!.lat : null,
      lng: hasCoords ? location!.lng : null,
      geocode_accuracy_type: hasCoords ? 'city' : null,
      type: type || null,
      governance_subtype: governanceSubtype || null,
      sector_id: sectorId || null,
      is_sse: isSse,
      language: language || null,
      values_list: valuesList,
    };
  }, [
    name,
    slug,
    descriptionEn,
    descriptionFr,
    missionStatementEn,
    missionStatementFr,
    website,
    location,
    locationHasCoords,
    type,
    governanceSubtype,
    sectorId,
    isSse,
    language,
    valuesList,
  ]);

  return {
    isEditMode,
    name,
    setName,
    slug,
    setSlug,
    descriptionEn,
    setDescriptionEn,
    descriptionFr,
    setDescriptionFr,
    missionStatementEn,
    setMissionStatementEn,
    missionStatementFr,
    setMissionStatementFr,
    website,
    setWebsite,
    location,
    setLocationSelection,
    type,
    setType,
    governanceSubtype,
    setGovernanceSubtype,
    sectorId,
    setSectorId,
    isSse,
    setIsSse: setIsSseAndReconcileGovernance,
    language,
    setLanguage,
    valuesList,
    setValuesList,
    valueCutoff,
    slugManuallyEdited,
    setSlugManuallyEdited,
    buildFormInput,
  };
}
