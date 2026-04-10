import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface DeleteAccountOptions {
  password: string;
  captchaToken: string;
}

interface UseDeleteAccountReturn {
  deleteAccount: (options: DeleteAccountOptions) => Promise<void>;
  isDeleting: boolean;
  error: string | null;
  clearError: () => void;
}

/**
 * Hook for handling account deletion logic.
 * Separates business logic from UI concerns.
 */
export function useDeleteAccount(): UseDeleteAccountReturn {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const deleteAccount = useCallback(async ({ password, captchaToken }: DeleteAccountOptions) => {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password, captchaToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete account');
      }

      // Sign out to clear the session
      const supabase = createClient();
      await supabase.auth.signOut();

      // Hard redirect to clear any cached data
      window.location.href = '/';
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      throw err;
    } finally {
      setIsDeleting(false);
    }
  }, []);

  return {
    deleteAccount,
    isDeleting,
    error,
    clearError,
  };
}
