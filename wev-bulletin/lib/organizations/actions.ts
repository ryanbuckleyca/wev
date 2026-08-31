'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';
import { requireAdminSession } from '@/lib/auth/require-admin';
import { bulletinAgeCutoffIso } from '@/lib/bulletin/constants';
import { routing } from '@/i18n/routing';
import { logger } from '@/lib/logger';
import { mapUniqueViolation } from './action-errors';
import type { OrgFormInput } from './validate';
import { buildOrgPayload, buildOrgUpdateFields, validateOrgInput } from './validate';
import { normalizeOrgType } from './org-type';
import {
  ORG_SKIP_REASON_IGNORED,
  identityFieldsChanged,
  resolveSkipReasonAfterSave,
} from './assessment-review';
import type { OrgRecord } from './types';

/** Columns needed to decide whether a save unparks the org. */
const ORG_REVIEW_CONTEXT_COLUMNS =
  'slug, is_sse, type, assessment_skip_reason, sector_id, description, description_en, description_fr, language, values_list, name, website, municipality, province, location' as const;

function revalidateOrganizationRoutes(slug?: string, previousSlug?: string) {
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}/organizations`);
    revalidatePath(`/${locale}/admin/organizations`);
    if (slug) revalidatePath(`/${locale}/organizations/${slug}`);
    if (previousSlug && previousSlug !== slug) {
      revalidatePath(`/${locale}/organizations/${previousSlug}`);
    }
  }
}

export async function getOrganizationActiveJobCount(orgId: number): Promise<number> {
  const minDate = bulletinAgeCutoffIso();
  const { count, error } = await supabaseServer
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .gte('date_posted', minDate);

  if (error) {
    logger.error({ err: error, orgId }, 'Failed to count active jobs for organization');
    return 0;
  }

  return count ?? 0;
}

export type OrgCreateInput = OrgFormInput;
export type OrgUpdateInput = Partial<OrgFormInput>;

export type ActionSuccess = { ok: true; org: OrgRecord };
export type ActionError = { ok: false; error: string; field?: string };
export type ActionResult = ActionSuccess | ActionError;
export type DeleteResult = { ok: true } | ActionError;

export async function createOrganization(data: OrgCreateInput): Promise<ActionResult> {
  const authResult = await requireAdminSession();
  if (!authResult.ok) {
    return { ok: false, error: 'unauthorized' };
  }

  const validationError = validateOrgInput(data);
  if (validationError) {
    return { ok: false, error: validationError.error, field: validationError.field };
  }

  const payload = buildOrgPayload(data);

  const { data: org, error } = await supabaseServer
    .from('organizations')
    .insert(payload)
    .select()
    .single();

  if (error) {
    const uniqueError = mapUniqueViolation(error);
    if (uniqueError) return uniqueError;

    logger.error({ err: error, data }, 'Failed to create organization');
    return { ok: false, error: 'database_error' };
  }

  if (!org) {
    logger.error({ data }, 'Organization created but not returned');
    return { ok: false, error: 'database_error' };
  }

  logger.info(
    { orgId: org.id, orgName: org.name, userId: authResult.user.id },
    'Organization created by admin',
  );

  revalidateOrganizationRoutes(org.slug);

  return { ok: true, org };
}

export async function updateOrganization(id: number, data: OrgUpdateInput): Promise<ActionResult> {
  const authResult = await requireAdminSession();
  if (!authResult.ok) {
    return { ok: false, error: 'unauthorized' };
  }

  const validationError = validateOrgInput(data, {
    requireName: data.name !== undefined,
    requireSlug: data.slug !== undefined,
  });
  if (validationError) {
    return { ok: false, error: validationError.error, field: validationError.field };
  }

  const { data: existingOrg, error: existingError } = await supabaseServer
    .from('organizations')
    .select(ORG_REVIEW_CONTEXT_COLUMNS)
    .eq('id', id)
    .single();

  if (existingError || !existingOrg) {
    return { ok: false, error: 'not_found' };
  }

  const updates: Record<string, unknown> = buildOrgUpdateFields(data, {
    previousIsSse: existingOrg.is_sse,
    previousType: normalizeOrgType(existingOrg.type),
  });

  // Decide before the empty-updates check: clearing the reason can be the only
  // change a save produces.
  const nextSkipReason = resolveSkipReasonAfterSave({
    previousReason: existingOrg.assessment_skip_reason,
    merged: { ...existingOrg, ...updates },
    identityChanged: identityFieldsChanged(existingOrg, updates),
  });
  if (nextSkipReason === null) {
    updates.assessment_skip_reason = null;
  }

  if (Object.keys(updates).length === 0) {
    const { data: org, error } = await supabaseServer
      .from('organizations')
      .select()
      .eq('id', id)
      .single();

    if (error || !org) {
      return { ok: false, error: 'not_found' };
    }
    return { ok: true, org };
  }

  const { data: org, error } = await supabaseServer
    .from('organizations')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    const uniqueError = mapUniqueViolation(error);
    if (uniqueError) return uniqueError;

    if (error.code === 'PGRST116') {
      return { ok: false, error: 'not_found' };
    }

    logger.error({ err: error, orgId: id, updates }, 'Failed to update organization');
    return { ok: false, error: 'database_error' };
  }

  if (!org) {
    return { ok: false, error: 'not_found' };
  }

  logger.info(
    { orgId: org.id, orgName: org.name, userId: authResult.user.id },
    'Organization updated by admin',
  );

  revalidateOrganizationRoutes(org.slug, existingOrg.slug);

  return { ok: true, org };
}

/**
 * Retry or ignore a parked organization.
 *
 * Retry clears `assessment_skip_reason`, making the org eligible for exactly one
 * more catch-up assessment. Ignore parks it permanently and hides it from the
 * Needs review filter.
 */
export async function setOrganizationAssessmentReview(
  id: number,
  action: 'retry' | 'ignore',
): Promise<ActionResult> {
  const authResult = await requireAdminSession();
  if (!authResult.ok) {
    return { ok: false, error: 'unauthorized' };
  }

  const { data: org, error } = await supabaseServer
    .from('organizations')
    .update({
      assessment_skip_reason: action === 'retry' ? null : ORG_SKIP_REASON_IGNORED,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return { ok: false, error: 'not_found' };
    }
    logger.error({ err: error, orgId: id, action }, 'Failed to update organization review state');
    return { ok: false, error: 'database_error' };
  }

  if (!org) {
    return { ok: false, error: 'not_found' };
  }

  logger.info(
    { orgId: org.id, orgName: org.name, action, userId: authResult.user.id },
    'Organization assessment review state changed by admin',
  );

  revalidateOrganizationRoutes(org.slug);

  return { ok: true, org };
}

export async function deleteOrganization(id: number): Promise<DeleteResult> {
  const authResult = await requireAdminSession();
  if (!authResult.ok) {
    return { ok: false, error: 'unauthorized' };
  }

  const { data: existing, error: fetchError } = await supabaseServer
    .from('organizations')
    .select('id, name, slug')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) {
    logger.error({ err: fetchError, orgId: id }, 'Failed to load organization for delete');
    return { ok: false, error: 'database_error' };
  }
  if (!existing) {
    return { ok: false, error: 'not_found' };
  }

  const { error } = await supabaseServer.from('organizations').delete().eq('id', id);

  if (error) {
    logger.error({ err: error, orgId: id }, 'Failed to delete organization');
    return { ok: false, error: 'database_error' };
  }

  logger.info(
    { orgId: id, orgName: existing.name, userId: authResult.user.id },
    'Organization deleted by admin',
  );

  revalidateOrganizationRoutes(existing.slug);

  return { ok: true };
}
