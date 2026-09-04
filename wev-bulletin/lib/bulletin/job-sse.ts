/**
 * Job SSE eligibility: Solidarity Economy is an employer property.
 * A job may be marked SSE only when the linked organization is SSE.
 */

export function resolveJobIsSse(
  proposed: boolean | null | undefined,
  orgIsSse: boolean | null | undefined,
): boolean | null {
  if (proposed !== true) {
    return proposed === false ? false : null;
  }
  if (orgIsSse === true) return true;
  if (orgIsSse === false) return false;
  return null;
}

/** Minimal supabase surface used by demoteOrgJobSse (avoids coupling to generated types). */
export type DemoteJobsClient = {
  from: (table: 'jobs') => {
    update: (values: { is_sse: false }) => {
      eq: (column: 'organization_id' | 'is_sse', value: number | boolean) => {
        eq: (
          column: 'organization_id' | 'is_sse',
          value: number | boolean,
        ) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
      };
    };
  };
};

/** Force is_sse=false on all SSE jobs for a non-SSE organization. */
export async function demoteOrgJobSse(
  supabase: DemoteJobsClient,
  organizationId: number,
): Promise<number> {
  const { data, error } = await supabase
    .from('jobs')
    .update({ is_sse: false })
    .eq('organization_id', organizationId)
    .eq('is_sse', true);

  if (error) return 0;
  return Array.isArray(data) ? data.length : 0;
}
