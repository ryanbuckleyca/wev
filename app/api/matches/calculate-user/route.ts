import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateUserMatches } from '@/lib/match-calculator'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: Request) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // Verify the user exists and has permission
    const supabase = await createClient()
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Calculate matches for this user
    await calculateUserMatches(userId)

    return NextResponse.json({ success: true, message: 'User matches calculated' })
  } catch (error) {
    console.error('Error calculating user matches:', error)
    return NextResponse.json(
      { error: 'Failed to calculate user matches' },
      { status: 500 }
    )
  }
}
