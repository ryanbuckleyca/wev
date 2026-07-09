import { generateSlug } from '@/lib/slug';
import { VALUES_LIST } from '@/lib/values';
import {
  MAX_ORG_DESCRIPTION_LENGTH,
  MAX_ORG_MISSION_LENGTH,
  MAX_ORG_VALUES,
  ORG_TYPES,
  SLUG_PATTERN,
  type OrgType,
} from './constants';

export interface OrgFormInput {
  name: string;
  slug?: string;
  description?: string | null;
  mission_statement?: string | null;
  website?: string | null;
  location?: string | null;
  type?: string | null;
  is_sse?: boolean;
  values_list?: string[] | null;
}

export type OrgValidationError = { field: string; error: string };

const VALID_VALUE_IDS = new Set<string>(VALUES_LIST);

const ORG_TYPE_ALIASES: Record<string, OrgType> = {
  nonprofit: 'nonprofit',
  cooperative: 'cooperative',
  socialenterprise: 'social enterprise',
  government: 'government',
  union: 'union',
  other: 'other',
};

export function normalizeOrgType(raw: string | null | undefined): OrgType | null {
  if (!raw?.trim()) return null;
  const key = raw.toLowerCase().trim().replace(/[\s_-]+/g, '');
  return ORG_TYPE_ALIASES[key] ?? null;
}

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

function isValidWebsite(url: string | null | undefined): boolean {
  if (!url?.trim()) return true;
  return url.startsWith('http://') || url.startsWith('https://');
}

export function validateOrgInput(
  data: Partial<OrgFormInput>,
  options: { requireName?: boolean; requireSlug?: boolean } = {},
): OrgValidationError | null {
  const { requireName = true, requireSlug = true } = options;

  if (data.name !== undefined && !data.name.trim()) {
    return { field: 'name', error: 'name_required' };
  }
  if (requireName && !data.name?.trim()) {
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
  type: OrgType | null;
  is_sse: boolean;
  values: string | null;
  values_list: string[] | null;
  values_rated: { value: string; rank: number }[] | null;
  sse_rating: 'weak_yes' | 'no';
}

export function buildOrgPayload(data: OrgFormInput): NormalizedOrgPayload {
  const name = data.name.trim();
  const slug = data.slug?.trim() || generateSlug(name);
  const valuesList = normalizeOrgValuesList(data.values_list);
  const isSse = data.is_sse ?? false;

  return {
    name,
    slug,
    description: data.description?.trim() || null,
    mission_statement: data.mission_statement?.trim() || null,
    website: data.website?.trim() || null,
    location: data.location?.trim() || null,
    type: normalizeOrgType(data.type),
    is_sse: isSse,
    values: valuesList?.join(', ') ?? null,
    values_list: valuesList,
    values_rated: valuesList
      ? valuesList.map((value, index) => ({ value, rank: index + 1 }))
      : null,
    sse_rating: isSse ? 'weak_yes' : 'no',
  };
}

export function buildOrgUpdateFields(
  data: Partial<OrgFormInput>,
): Partial<NormalizedOrgPayload> {
  const updates: Partial<NormalizedOrgPayload> = {};

  if (data.name !== undefined) updates.name = data.name.trim();
  if (data.slug !== undefined) updates.slug = data.slug.trim();
  if (data.description !== undefined) updates.description = data.description?.trim() || null;
  if (data.mission_statement !== undefined) {
    updates.mission_statement = data.mission_statement?.trim() || null;
  }
  if (data.website !== undefined) updates.website = data.website?.trim() || null;
  if (data.location !== undefined) updates.location = data.location?.trim() || null;
  if (data.type !== undefined) updates.type = normalizeOrgType(data.type);
  if (data.is_sse !== undefined) {
    updates.is_sse = data.is_sse;
    updates.sse_rating = data.is_sse ? 'weak_yes' : 'no';
  }
  if (data.values_list !== undefined) {
    const valuesList = normalizeOrgValuesList(data.values_list);
    updates.values_list = valuesList;
    updates.values = valuesList?.join(', ') ?? null;
    updates.values_rated = valuesList
      ? valuesList.map((value, index) => ({ value, rank: index + 1 }))
      : null;
  }

  return updates;
}

export function isOrgType(value: string): value is OrgType {
  return (ORG_TYPES as readonly string[]).includes(value);
}
