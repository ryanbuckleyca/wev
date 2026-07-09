import { useState, useEffect, useCallback } from 'react';
import { generateSlug } from '@/lib/slug';
import type { OrgRecord } from '@/lib/organizations/types';
import { normalizeOrgType } from '@/lib/organizations/org-type';
import type { OrgFormInput } from '@/lib/organizations/validate';

export function useOrgAdminFormState(initialValues?: Partial<OrgRecord>) {
  const isEditMode = Boolean(initialValues?.id);

  const [name, setName] = useState(initialValues?.name || '');
  const [slug, setSlug] = useState(initialValues?.slug || '');
  const [description, setDescription] = useState(initialValues?.description || '');
  const [missionStatement, setMissionStatement] = useState(initialValues?.mission_statement || '');
  const [website, setWebsite] = useState(initialValues?.website || '');
  const [location, setLocation] = useState(initialValues?.location || '');
  const [type, setType] = useState(() => normalizeOrgType(initialValues?.type) || '');
  const [isSse, setIsSse] = useState(initialValues?.is_sse ?? false);
  const [valuesList, setValuesList] = useState<string[]>(initialValues?.values_list ?? []);
  const [valueCutoff, setValueCutoff] = useState(valuesList.length);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(Boolean(initialValues?.slug));

  useEffect(() => {
    if (!isEditMode && name && !slugManuallyEdited) {
      setSlug(generateSlug(name));
    }
  }, [name, isEditMode, slugManuallyEdited]);

  const buildFormInput = useCallback(
    (): OrgFormInput => ({
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || null,
      mission_statement: missionStatement.trim() || null,
      website: website.trim() || null,
      location: location.trim() || null,
      type: type || null,
      is_sse: isSse,
      values_list: valuesList,
    }),
    [name, slug, description, missionStatement, website, location, type, isSse, valuesList],
  );

  return {
    isEditMode,
    name,
    setName,
    slug,
    setSlug,
    description,
    setDescription,
    missionStatement,
    setMissionStatement,
    website,
    setWebsite,
    location,
    setLocation,
    type,
    setType,
    isSse,
    setIsSse,
    valuesList,
    setValuesList,
    valueCutoff,
    setValueCutoff,
    slugManuallyEdited,
    setSlugManuallyEdited,
    buildFormInput,
  };
}
