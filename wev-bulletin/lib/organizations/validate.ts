import { generateSlug } from '@/lib/slug';
import { isValidSector } from '@/lib/sectors';
import { VALUES_LIST } from '@/lib/values';
import {
  MAX_ORG_DESCRIPTION_LENGTH,
  MAX_ORG_MISSION_LENGTH,
  MAX_ORG_VALUES,
  SLUG_PATTERN,
  type OrgType,
} from './constants';
import { normalizeOrgType } from './org-type';
import { buildAdminSseFields } from './sse-admin-fields';

export interface OrgFormInput {
  name: string;
  slug?: string;
  description?: string | null;
  mission_statement?: string | null;
  website?: string | null;
  location?: string | null;
  municipality?: string | null;
  province?: string | null;
  lat?: number | null;
  lng?: number | null;
  geocode_accuracy_type?: string | null;
  type?: string | null;
  sector_id?: string | null;
  is_sse?: boolean;
  values_list?: string[] | null;
}

export type OrgValidationError = { field: string; error: string };

const VALID_VALUE_IDS = new Set<string>(VALUES_LIST);

export function normalizeOrgValuesList(raw: string[] | null | undefined): string[] | null {
  if (!raw?.length) return null;
  const seen = new Set<string>();
  const values: string[] = [];
  for (const entry of raw) {
    const label = entry.trim();
    if (!label || !VALID_VALUE_IDS.has(label) || seen.has(label)) continue;
    seen.add(label);
    values.push(label);
    if (values.length >= MAX_ORG_VALUES) break;
  }
  return values.length > 0 ? values : null;
}

export function buildValuesRated(
  valuesList: string[] | null,
): { value: string; rank: number }[] | null {
  if (!valuesList?.length) return null;
  return valuesList.map((value, index) => ({ value, rank: index + 1 }));
}

function isValidWebsite(url: string | null | undefined): boolean {
  if (!url?.trim()) return true;
  return url.startsWith('http://') || url.startsWith('https://');
}

export function validateOrgInput(
  data: Partial<OrgFormInput>,
  options: { requireName?: boolean; requireSlug?: boolean } = {},
): OrgValidationError | null {
  const { requireName = true, requireSlug = true } = options;

  if (requireName && !data.name?.trim()) {
    return { field: 'name', error: 'name_required' };
  }
  if (!requireName && data.name !== undefined && !data.name.trim()) {
    return { field: 'name', error: 'name_required' };
  }

  const slug = data.slug?.trim() || (data.name ? generateSlug(data.name) : '');
  if (requireSlug && !slug) {
    return { field: 'slug', error: 'invalid_slug' };
  }
  if (slug && !SLUG_PATTERN.test(slug)) {
    return { field: 'slug', error: 'slug_invalid' };
  }

  if (data.website && !isValidWebsite(data.website)) {
    return { field: 'website', error: 'website_invalid' };
  }

  const description = data.description?.trim() ?? '';
  if (description.length > MAX_ORG_DESCRIPTION_LENGTH) {
    return { field: 'description', error: 'description_too_long' };
  }

  const mission = data.mission_statement?.trim() ?? '';
  if (mission.length > MAX_ORG_MISSION_LENGTH) {
    return { field: 'mission_statement', error: 'mission_too_long' };
  }

  if (data.type?.trim() && !normalizeOrgType(data.type)) {
    return { field: 'type', error: 'invalid_type' };
  }

  if (data.sector_id?.trim() && !isValidSector(data.sector_id)) {
    return { field: 'sector_id', error: 'invalid_sector' };
  }

  if (data.values_list?.length) {
    const normalized = normalizeOrgValuesList(data.values_list);
    if (!normalized || normalized.length !== data.values_list.length) {
      return { field: 'values_list', error: 'invalid_values' };
    }
    if (data.values_list.length > MAX_ORG_VALUES) {
      return { field: 'values_list', error: 'too_many_values' };
    }
  }

  return null;
}

export interface NormalizedOrgPayload {
  name: string;
  slug: string;
  description: string | null;
  mission_statement: string | null;
  website: string | null;
  location: string | null;
  municipality: string | null;
  province: string | null;
  lat: number | null;
  lng: number | null;
  geocode_accuracy_type: string | null;
  type: OrgType | null;
  sector_id: string | null;
  is_sse: boolean;
  values: string | null;
  values_list: string[] | null;
  values_rated: { value: string; rank: number }[] | null;
  sse_rating: 'weak_yes' | 'no';
  sse_details: ReturnType<typeof buildAdminSseFields>['sse_details'];
}

function applyValuesFields(
  valuesList: string[] | null,
): Pick<NormalizedOrgPayload, 'values' | 'values_list' | 'values_rated'> {
  return {
    values_list: valuesList,
    values: valuesList?.join(', ') ?? null,
    values_rated: buildValuesRated(valuesList),
  };
}

function applyLocationFields(
  data: Pick<
    OrgFormInput,
    'location' | 'municipality' | 'province' | 'lat' | 'lng' | 'geocode_accuracy_type'
  >,
): Pick<
  NormalizedOrgPayload,
  'location' | 'municipality' | 'province' | 'lat' | 'lng' | 'geocode_accuracy_type'
> {
  const location = data.location?.trim() || null;
  const municipality = data.municipality?.trim() || null;
  const province = data.province?.trim() || null;
  const lat = typeof data.lat === 'number' && Number.isFinite(data.lat) ? data.lat : null;
  const lng = typeof data.lng === 'number' && Number.isFinite(data.lng) ? data.lng : null;
  const hasCoords = lat != null && lng != null;

  return {
    location,
    municipality,
    province,
    lat,
    lng,
    geocode_accuracy_type: hasCoords ? data.geocode_accuracy_type?.trim() || 'city' : null,
  };
}

export function buildOrgPayload(data: OrgFormInput): NormalizedOrgPayload {
  const name = data.name.trim();
  const slug = data.slug?.trim() || generateSlug(name);
  const valuesList = normalizeOrgValuesList(data.values_list);
  const type = normalizeOrgType(data.type);
  // Government orgs are never SSE (type is allowed; SSE flag is not).
  const isSse = type === 'government' ? false : (data.is_sse ?? false);
  const sseFields = buildAdminSseFields(isSse);

  return {
    name,
    slug,
    description: data.description?.trim() || null,
    mission_statement: data.mission_statement?.trim() || null,
    website: data.website?.trim() || null,
    ...applyLocationFields(data),
    type,
    sector_id: isValidSector(data.sector_id) ? (data.sector_id as string) : null,
    is_sse: isSse,
    ...applyValuesFields(valuesList),
    ...sseFields,
  };
}

export function buildOrgUpdateFields(
  data: Partial<OrgFormInput>,
  options: { previousIsSse?: boolean | null; previousType?: OrgType | null } = {},
): Partial<NormalizedOrgPayload> {
  const updates: Partial<NormalizedOrgPayload> = {};

  if (data.name !== undefined) updates.name = data.name.trim();
  if (data.slug !== undefined) updates.slug = data.slug.trim();
  if (data.description !== undefined) updates.description = data.description?.trim() || null;
  if (data.mission_statement !== undefined) {
    updates.mission_statement = data.mission_statement?.trim() || null;
  }
  if (data.website !== undefined) updates.website = data.website?.trim() || null;

  const locationTouched =
    data.location !== undefined ||
    data.municipality !== undefined ||
    data.province !== undefined ||
    data.lat !== undefined ||
    data.lng !== undefined ||
    data.geocode_accuracy_type !== undefined;
  if (locationTouched) {
    Object.assign(updates, applyLocationFields(data));
  }

  const typeChanging = data.type !== undefined;
  const nextType: OrgType | null = typeChanging
    ? normalizeOrgType(data.type)
    : (options.previousType ?? null);
  if (typeChanging) updates.type = nextType;

  if (data.sector_id !== undefined)
    updates.sector_id = isValidSector(data.sector_id) ? (data.sector_id as string) : null;
  if (data.values_list !== undefined) {
    const valuesList = normalizeOrgValuesList(data.values_list);
    Object.assign(updates, applyValuesFields(valuesList));
  }

  const governmentBlocksSse = nextType === 'government';
  if (data.is_sse !== undefined || (typeChanging && governmentBlocksSse)) {
    const requested = data.is_sse ?? options.previousIsSse ?? false;
    const isSse = governmentBlocksSse ? false : Boolean(requested);
    updates.is_sse = isSse;
    const requestOverridden =
      data.is_sse !== undefined && Boolean(data.is_sse) !== isSse;
    if (
      isSse !== options.previousIsSse ||
      (typeChanging && governmentBlocksSse) ||
      requestOverridden
    ) {
      Object.assign(updates, buildAdminSseFields(isSse));
    }
  }

  return updates;
}
