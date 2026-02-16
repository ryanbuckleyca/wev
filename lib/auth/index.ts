/**
 * Auth barrel file.
 * 
 * To swap providers, change this single import:
 *   import { SupabaseAuthAdapter } from './supabase-adapter'
 * to your new adapter, e.g.:
 *   import { FirebaseAuthAdapter } from './firebase-adapter'
 * 
 * Everything else in the app stays the same.
 */

export { SupabaseAuthAdapter as AuthAdapterImpl } from './supabase-adapter'
export type { AuthAdapter, AuthUser, AuthSession, AuthEvent, AuthStateCallback } from './types'
export { UserRole } from './types'
