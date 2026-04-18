import { NextResponse } from 'next/server';
import { requireAdminResponse } from '@/lib/auth/require-admin';
import { logger } from '@/lib/logger';
 
export const dynamic = 'force-dynamic';

export async function POST() {
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

    // Try to get the default branch first
    const repoResponse = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}`, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!repoResponse.ok) {
      const errorText = await repoResponse.text();
      return NextResponse.json(
        { error: `GitHub API error: ${errorText}` },
        { status: repoResponse.status },
      );
    }

    const repoData = await repoResponse.json();
    const defaultBranch = repoData.default_branch || 'main';

    const response = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflowId}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: defaultBranch,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `GitHub API error: ${errorText}` },
        { status: response.status },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error triggering GitHub workflow');
    return NextResponse.json({ error: 'Failed to trigger workflow' }, { status: 500 });
  }
}
