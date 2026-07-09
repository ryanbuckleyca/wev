'use server';

import { supabaseServer } from '@/lib/supabase-server';
import { requireAdminSession } from '@/lib/auth/require-admin';
import { generateSlug } from '@/lib/slug';
import { logger } from '@/lib/logger';
import type { OrgRecord } from './types';

// Input types for create/update operations
export interface OrgCreateInput {
  name: string;
  slug?: string; // Optional - will be generated if not provided
  description?: string | null;
  website?: string | null;
  location?: string | null;
  type?: string | null;
  is_sse?: boolean;
  mission_statement?: string | null;
  values?: string | null;
}

export type OrgUpdateInput = Partial<OrgCreateInput>;

// Result types
export type ActionSuccess = { ok: true; org: OrgRecord };
export type ActionError = { ok: false; error: string; field?: string };
export type ActionResult = ActionSuccess | ActionError;

/**
 * Creates a new organization record.
 * Requires admin authorization.
 */
export async function createOrganization(data: OrgCreateInput): Promise<ActionResult> {
  // Enforce admin authorization
  const authResult = await requireAdminSession();
  if (!authResult.ok) {
    return { ok: false, error: 'unauthorized' };
  }

  // Validate required fields
  if (!data.name || data.name.trim() === '') {
    return { ok: false, error: 'name_required', field: 'name' };
  }

  // Generate slug if not provided
  const slug = data.slug?.trim() || generateSlug(data.name);
  if (slug === '') {
    return { ok: false, error: 'invalid_slug', field: 'slug' };
  }

  // Insert organization
  const { data: org, error } = await supabaseServer
    .from('organizations')
    .insert({
      name: data.name.trim(),
      slug,
      description: data.description?.trim() || null,
      website: data.website?.trim() || null,
      location: data.location?.trim() || null,
      type: data.type || null,
      is_sse: data.is_sse ?? false,
      mission_statement: data.mission_statement?.trim() || null,
      values: data.values?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    // Check for unique constraint violations
    if (error.code === '23505') {
      // Unique violation
      if (error.message.includes('slug')) {
        return { ok: false, error: 'slug_taken', field: 'slug' };
      }
      if (error.message.includes('identity')) {
        return { ok: false, error: 'organization_exists', field: 'name' };
      }
    }

    logger.error(
      { err: error, data },
      'Failed to create organization',
    );
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

/**
 * Updates an existing organization record.
 * Requires admin authorization.
 */
export async function updateOrganization(
  id: number,
  data: OrgUpdateInput,
): Promise<ActionResult> {
  // Enforce admin authorization
  const authResult = await requireAdminSession();
  if (!authResult.ok) {
    return { ok: false, error: 'unauthorized' };
  }

  // Validate name if provided
  if (data.name !== undefined && data.name.trim() === '') {
    return { ok: false, error: 'name_required', field: 'name' };
  }

  // Validate slug if provided
  if (data.slug !== undefined && data.slug.trim() === '') {
    return { ok: false, error: 'invalid_slug', field: 'slug' };
  }

  // Build update object with only provided fields
  const updates: Partial<OrgRecord> = {};
  if (data.name !== undefined) updates.name = data.name.trim();
  if (data.slug !== undefined) updates.slug = data.slug.trim();
  if (data.description !== undefined) updates.description = data.description?.trim() || null;
  if (data.website !== undefined) updates.website = data.website?.trim() || null;
  if (data.location !== undefined) updates.location = data.location?.trim() || null;
  if (data.type !== undefined) updates.type = data.type || null;
  if (data.is_sse !== undefined) updates.is_sse = data.is_sse;
  if (data.mission_statement !== undefined) {
    updates.mission_statement = data.mission_statement?.trim() || null;
  }
  if (data.values !== undefined) updates.values = data.values?.trim() || null;

  // Nothing to update
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

  // Update organization
  const { data: org, error } = await supabaseServer
    .from('organizations')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    // Check for unique constraint violations
    if (error.code === '23505') {
      if (error.message.includes('slug')) {
        return { ok: false, error: 'slug_taken', field: 'slug' };
      }
      if (error.message.includes('identity')) {
        return { ok: false, error: 'organization_exists', field: 'name' };
      }
    }

    // Not found
    if (error.code === 'PGRST116') {
      return { ok: false, error: 'not_found' };
    }

    logger.error(
      { err: error, orgId: id, updates },
      'Failed to update organization',
    );
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
