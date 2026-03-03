import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const githubToken = process.env.GITHUB_TOKEN
    const repoOwner = "ryanbuckleyca"
    const repoName = "wev-scraper"
    const workflowId = process.env.GITHUB_WORKFLOW_ID || 'scrape.yml'

    if (!githubToken || !repoOwner || !repoName) {
      return NextResponse.json(
        { error: 'Missing GitHub configuration' },
        { status: 500 }
      )
    }

    // Try to get the default branch first
    const repoResponse = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}`,
      {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    )

    if (!repoResponse.ok) {
      const errorText = await repoResponse.text()
      return NextResponse.json(
        { error: `GitHub API error: ${errorText}` },
        { status: repoResponse.status }
      )
    }

    const repoData = await repoResponse.json()
    const defaultBranch = repoData.default_branch || 'main'

    const response = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflowId}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: defaultBranch,
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: `GitHub API error: ${errorText}` },
        { status: response.status }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error triggering workflow:', error)
    return NextResponse.json(
      { error: 'Failed to trigger workflow' },
      { status: 500 }
    )
  }
}
