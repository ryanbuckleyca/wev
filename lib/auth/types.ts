/**
 * Provider-agnostic auth types.
 * 
 * To swap auth providers (e.g. Supabase → Firebase → Auth0),
 * implement AuthAdapter with the new provider and update
 * lib/auth/index.ts to export it. No other files need to change.
 */

export enum UserRole {
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  USER = 'user',
}

export interface AuthUser {
  id: string
  email: string
  role: UserRole
  fullName: string | null
}

export interface AuthSession {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
}

export type AuthEvent =
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'USER_UPDATED'
  | 'PASSWORD_RECOVERY'
  | 'TOKEN_REFRESHED'

export type AuthStateCallback = (
  event: AuthEvent,
  session: AuthSession | null
) => void

/**
 * The contract every auth provider must implement.
 * Keep this minimal — add methods only when needed.
 */
export interface AuthAdapter {
  /** Get the current session (null if logged out) */
  getSession(): Promise<AuthSession | null>

  /** Fetch the user profile for a given user id */
  getUserProfile(userId: string): Promise<AuthUser | null>

  /** Sign out the current user */
  signOut(): Promise<void>

  /** Subscribe to auth state changes. Returns an unsubscribe function. */
  onAuthStateChange(callback: AuthStateCallback): () => void

  /**
   * Return the underlying provider client for use by provider-specific
   * UI components (e.g. @supabase/auth-ui-react). This is the only
   * escape hatch — avoid using it in business logic.
   */
  getProviderClient(): unknown
}
