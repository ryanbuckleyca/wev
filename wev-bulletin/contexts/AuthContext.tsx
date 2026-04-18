'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type AuthUser = {
  id: string;
  email: string | null;
};

export type UserRole = 'admin' | 'moderator' | 'user';

export interface AuthContextValue {
  user: AuthUser | null;
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

type SessionResponse = {
  user: AuthUser | null;
  roles?: unknown;
};

async function fetchAuthSession(signal?: AbortSignal): Promise<{
  user: AuthUser | null;
  roles: string[];
}> {
  try {
    const response = await fetch('/api/auth/session', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'cache-control': 'no-store',
      },
      signal,
    });

    if (!response.ok) {
      return { user: null, roles: ['user'] };
    }

    const payload = (await response.json()) as SessionResponse;
    const roles = Array.isArray(payload.roles)
      ? normalizeRoles(
          payload.roles.filter(
            (role: unknown): role is string => typeof role === 'string' && role.length > 0,
          ),
        )
      : ['user'];

    return {
      user:
        payload.user && typeof payload.user.id === 'string'
          ? {
              id: payload.user.id,
              email: typeof payload.user.email === 'string' ? payload.user.email : null,
            }
          : null,
      roles,
    };
  } catch {
    return { user: null, roles: ['user'] };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [roles, setRoles] = useState<string[]>(['user']);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    const syncAuth = async () => {
      const session = await fetchAuthSession(controller.signal);
      if (!mounted) return;

      setUser(session.user);
      setRoles(normalizeRoles(session.roles));
      setLoading(false);
    };

    /**
     * We use polling and window focus events instead of Supabase Realtime
     * to avoid shipping the full Supabase client bundle to the browser.
     * This keeps the client-side footprint small but means session changes
     * may have a slight delay if the window stays visible.
     */
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncAuth();
      }
    };

    const handleWindowFocus = () => {
      void syncAuth();
    };

    // Fallback polling for long-lived sessions (every 5 minutes)
    const pollInterval = window.setInterval(() => {
      void syncAuth();
    }, 5 * 60 * 1000);

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      controller.abort();
      window.clearInterval(pollInterval);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
