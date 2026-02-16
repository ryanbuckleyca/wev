import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { password, accessToken } = await request.json()

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: 'No access token provided' },
        { status: 400 }
      )
    }

    // Use service role key to update the user's password
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_KEY!
    )

    // Decode the JWT to get the user ID
    const payload = JSON.parse(atob(accessToken.split('.')[1]))
    const userId = payload.sub

    if (!userId) {
      return NextResponse.json(
        { error: 'Invalid access token' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password }
    )

    if (error) {
      console.error('Password update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Reset password API error:', err)
    const message = err instanceof Error ? err.message : 'Failed to reset password'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
