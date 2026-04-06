'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { parseRolesColumn } from '@/lib/auth';

export type UserRole = 'admin' | 'moderator' | 'user';

interface AuthContextValue {
  user: User | null;
  role: UserRole;
  roles: string[];
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  role: 'user',
  roles: ['user'],
  loading: true,
});

function normalizeRoles(roles: string[]): string[] {
  const cleaned = roles.map((role) => role.trim()).filter((role) => role.length > 0);

  if (cleaned.length === 0) {
    return ['user'];
  }

  return Array.from(new Set(cleaned));
}

function deriveRole(roles: string[]): UserRole {
  const normalized = normalizeRoles(roles).map((role) => role.toLowerCase());
  if (normalized.includes('admin')) return 'admin';
  if (normalized.includes('moderator')) return 'moderator';
  return 'user';
}

// ─── In-flight deduplication + 5-minute memory cache ──────────────────────
const ROLES_CACHE_TTL_MS = 5 * 60 * 1000;

interface RolesCacheEntry {
  roles: string[];
  fetchedAt: number;
}

/** Module-level cache: survives re-renders but not full page reloads. */
const rolesCache = new Map<string, RolesCacheEntry>();
/** In-flight promises keyed by userId — prevents duplicate concurrent fetches. */
const inflight = new Map<string, Promise<string[]>>();

async function fetchRolesForUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<string[]> {
  // 1. Return cached value if still fresh.
  const cached = rolesCache.get(userId);
  if (cached && Date.now() - cached.fetchedAt < ROLES_CACHE_TTL_MS) {
    return cached.roles;
  }

  // 2. Deduplicate: if there's already an in-flight request for this user, wait for it.
  const existing = inflight.get(userId);
  if (existing) return existing;

  // 3. Perform the actual fetch.
  const promise = (async () => {
    try {
      const response = await fetch('/api/auth/roles', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'cache-control': 'no-store',
        },
      });

      if (response.ok) {
        const payload = await response.json();
        if (payload && Array.isArray(payload.roles)) {
          const roles = normalizeRoles(
            payload.roles.filter(
              (role: unknown): role is string => typeof role === 'string' && role.length > 0,
            ),
          );
          rolesCache.set(userId, { roles, fetchedAt: Date.now() });
          return roles;
        }
      }
    } catch {
      // Fall back to direct browser query.
    }

    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('roles')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error) {
        const roles = parseRolesColumn((data as { roles?: unknown } | null)?.roles);
        rolesCache.set(userId, { roles, fetchedAt: Date.now() });
        return roles;
      }
    } catch {
      // Keep default role when direct query fails.
    }

    return ['user'];
  })();

  inflight.set(userId, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(userId);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<string[]>(['user']);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef(createClient());
  const userIdRef = useRef<string | null>(null);
  const rolesResolvedForRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const supabase = supabaseRef.current;
    const loadAuthState = async () => {
      try {
        let resolvedUser: User | null = null;

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          resolvedUser = session.user;
        } else {
          const {
            data: { user: currentUser },
          } = await supabase.auth.getUser();
          resolvedUser = currentUser ?? null;
        }

        if (!mounted) return;

        userIdRef.current = resolvedUser?.id ?? null;
        setUser(resolvedUser);
        setRoles(['user']);
        setLoading(false);

        if (resolvedUser) {
          fetchRolesForUser(supabase, resolvedUser.id)
            .then((resolvedRoles) => {
              if (!mounted) return;
              rolesResolvedForRef.current = resolvedUser!.id;
              setRoles(resolvedRoles);
            })
            .catch(() => {
              if (!mounted) return;
              setRoles(['user']);
            });
        }
      } catch {
        if (!mounted) return;
        userIdRef.current = null;
        rolesResolvedForRef.current = null;
        setUser(null);
        setRoles(['user']);
        setLoading(false);
      }
    };

    loadAuthState();

    const {
      data: { subscription },
    } = supabaseRef.current.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      const nextUser = session?.user ?? null;
      const userChanged = nextUser?.id !== userIdRef.current;

      userIdRef.current = nextUser?.id ?? null;
      setUser(nextUser);
      setLoading(false);

      if (!nextUser) {
        rolesResolvedForRef.current = null;
        setRoles(['user']);
      } else if (userChanged) {
        rolesResolvedForRef.current = null;
        setRoles(['user']);
        fetchRolesForUser(supabaseRef.current, nextUser.id)
          .then((resolvedRoles) => {
            if (!mounted) return;
            rolesResolvedForRef.current = nextUser.id;
            setRoles(resolvedRoles);
          })
          .catch(() => {
            if (!mounted) return;
            setRoles(['user']);
          });
      } else if (event === 'TOKEN_REFRESHED' && rolesResolvedForRef.current === nextUser.id) {
        // Same user, token just refreshed (e.g. tab switch) — roles haven't changed,
        // skip refetch to avoid a transient downgrade if the API races the refresh.
      } else if (rolesResolvedForRef.current !== nextUser.id) {
        fetchRolesForUser(supabaseRef.current, nextUser.id)
          .then((resolvedRoles) => {
            if (!mounted) return;
            rolesResolvedForRef.current = nextUser.id;
            setRoles(resolvedRoles);
          })
          .catch(() => {
            if (!mounted) return;
            setRoles(['user']);
          });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    return {
      user,
      role: deriveRole(roles),
      roles,
      loading,
    };
  }, [user, roles, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
