import { NextRequest, NextResponse } from 'next/server';
import { requireAdminResponse } from '@/lib/auth/require-admin';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const denied = await requireAdminResponse();
    if (denied) return denied;

    const githubToken = process.env.WEV_GITHUB_TOKEN;
    const repoOwner = 'ryanbuckleyca';
    const repoName = 'wev-scraper';
    const workflowId = 'scrape.yml';

    if (!githubToken || !repoOwner || !repoName) {
      return NextResponse.json({ error: 'Missing GitHub configuration' }, { status: 500 });
    }

    // Get workflow runs, optionally filtered to runs created after a given timestamp
    const createdAfterParam = request.nextUrl.searchParams.get('created_after');

    let createdAfterMs: number | null = null;
    if (createdAfterParam) {
      createdAfterMs = Date.parse(createdAfterParam);
      if (Number.isNaN(createdAfterMs)) {
        return NextResponse.json(
          { error: `Invalid created_after value: ${createdAfterParam}` },
          { status: 400 },
        );
      }
    }

    const runsUrl = new URL(
      `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflowId}/runs`,
    );
    runsUrl.searchParams.set('per_page', '5');
    // Pass the filter to GitHub too so it does the heavy lifting server-side
    if (createdAfterParam) runsUrl.searchParams.set('created', `>=${createdAfterParam}`);

    const response = await fetch(runsUrl.toString(), {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `GitHub API error: ${errorText}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    // If filtering by created_after, find the first run at or after that time using
    // numeric timestamp comparison to avoid string format / millisecond mismatches
    const latestRun =
      createdAfterMs !== null
        ? (data.workflow_runs ?? []).find(
            (r: { created_at: string }) => Date.parse(r.created_at) >= createdAfterMs!,
          )
        : data.workflow_runs?.[0];

    if (!latestRun) {
      return NextResponse.json({ status: 'unknown', running: false });
    }

    const status = latestRun.status; // queued, in_progress, completed
    const conclusion = latestRun.conclusion; // success, failure, cancelled, null if still running

    return NextResponse.json({
      status,
      conclusion,
      running: status === 'queued' || status === 'in_progress',
      completed: status === 'completed',
      success: conclusion === 'success',
      runId: latestRun.id,
      createdAt: latestRun.created_at,
      updatedAt: latestRun.updated_at,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error checking GitHub workflow status');
    return NextResponse.json({ error: 'Failed to check workflow status' }, { status: 500 });
  }
}
