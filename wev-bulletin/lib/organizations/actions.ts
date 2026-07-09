'use server';

import { supabaseServer } from '@/lib/supabase-server';
import { requireAdminSession } from '@/lib/auth/require-admin';
import { logger } from '@/lib/logger';
import { mapUniqueViolation } from './action-errors';
import type { OrgFormInput } from './validate';
import { buildOrgPayload, buildOrgUpdateFields, validateOrgInput } from './validate';
import type { OrgRecord } from './types';

export type OrgCreateInput = OrgFormInput;
export type OrgUpdateInput = Partial<OrgFormInput>;

export type ActionSuccess = { ok: true; org: OrgRecord };
export type ActionError = { ok: false; error: string; field?: string };
export type ActionResult = ActionSuccess | ActionError;

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

  return { ok: true, org };
}

export async function updateOrganization(
  id: number,
  data: OrgUpdateInput,
): Promise<ActionResult> {
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

  const updates = buildOrgUpdateFields(data);

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

  return { ok: true, org };
}
