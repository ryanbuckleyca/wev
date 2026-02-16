import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  AuthAdapter,
  AuthEvent,
  AuthSession,
  AuthStateCallback,
  AuthUser,
  UserRole,
} from './types'

const EVENT_MAP: Record<string, AuthEvent> = {
  SIGNED_IN: 'SIGNED_IN',
  SIGNED_OUT: 'SIGNED_OUT',
  USER_UPDATED: 'USER_UPDATED',
  PASSWORD_RECOVERY: 'PASSWORD_RECOVERY',
  TOKEN_REFRESHED: 'TOKEN_REFRESHED',
}

export class SupabaseAuthAdapter implements AuthAdapter {
  private client: SupabaseClient

  constructor() {
    this.client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_KEY!
    )
  }

  async getSession(): Promise<AuthSession | null> {
    const {
      data: { session },
    } = await this.client.auth.getSession()

    if (!session) return null

    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at,
    }
  }

  async getUserProfile(userId: string): Promise<AuthUser | null> {
    const { data: profile } = await this.client
      .from('user_profiles')
      .select('id, email, role, full_name')
      .eq('id', userId)
      .single()

    if (!profile) return null

    return {
      id: profile.id,
      email: profile.email,
      role: profile.role as UserRole,
      fullName: profile.full_name,
    }
  }

  async signOut(): Promise<void> {
    // The publishable key doesn't support client-side signOut reliably,
    // so we call the server route and clear localStorage.
    await fetch('/api/auth/logout', { method: 'POST' })
    if (typeof window !== 'undefined') {
      Object.keys(localStorage)
        .filter((key) => key.startsWith('sb-'))
        .forEach((key) => localStorage.removeItem(key))
    }
  }

  onAuthStateChange(callback: AuthStateCallback): () => void {
    const {
      data: { subscription },
    } = this.client.auth.onAuthStateChange((event, session) => {
      const mapped = EVENT_MAP[event] ?? 'SIGNED_IN'
      const normalized: AuthSession | null = session
        ? {
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            expiresAt: session.expires_at,
          }
        : null

      callback(mapped, normalized)
    })

    return () => subscription.unsubscribe()
  }

  /**
   * Returns the raw SupabaseClient for provider-specific UI
   * (e.g. @supabase/auth-ui-react). Avoid in business logic.
   */
  getProviderClient(): SupabaseClient {
    return this.client
  }

  /**
   * Extract user ID from a Supabase session's access token JWT.
   */
  getUserIdFromToken(accessToken: string): string | null {
    try {
      const payload = JSON.parse(atob(accessToken.split('.')[1]))
      return payload.sub ?? null
    } catch {
      return null
    }
  }
}
