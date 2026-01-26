import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const githubToken = process.env.GITHUB_TOKEN
    const repoOwner = process.env.GITHUB_REPO_OWNER
    const repoName = process.env.GITHUB_REPO_NAME
    const workflowId = process.env.GITHUB_WORKFLOW_ID || 'scrape.yml'

    if (!githubToken || !repoOwner || !repoName) {
      return NextResponse.json(
        { error: 'Missing GitHub configuration' },
        { status: 500 }
      )
    }

    // Get workflow runs
    const response = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflowId}/runs?per_page=1`,
      {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: `GitHub API error: ${errorText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    const latestRun = data.workflow_runs?.[0]

    if (!latestRun) {
      return NextResponse.json({ status: 'unknown', running: false })
    }

    const status = latestRun.status // queued, in_progress, completed
    const conclusion = latestRun.conclusion // success, failure, cancelled, null if still running

    return NextResponse.json({
      status,
      conclusion,
      running: status === 'queued' || status === 'in_progress',
      completed: status === 'completed',
      success: conclusion === 'success',
      runId: latestRun.id,
      createdAt: latestRun.created_at,
      updatedAt: latestRun.updated_at,
    })
  } catch (error) {
    console.error('Error checking workflow status:', error)
    return NextResponse.json(
      { error: 'Failed to check workflow status' },
      { status: 500 }
    )
  }
}
