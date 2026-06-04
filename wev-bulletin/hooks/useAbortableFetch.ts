import { useEffect, useState } from 'react';

/**
 * A hook that handles abortable fetch operations with loading and error states.
 */
export function useAbortableFetch<T, Args extends any[]>(
  fetcher: (...args: [...Args, AbortSignal]) => Promise<T>,
  args: Args,
  enabled: boolean = true,
  debounceMs: number = 0,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    
    const execute = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetcher(...args, controller.signal);
        setData(result);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setData(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    if (debounceMs > 0) {
      const timeoutId = window.setTimeout(execute, debounceMs);
      return () => {
        window.clearTimeout(timeoutId);
        controller.abort();
      };
    } else {
      execute();
      return () => controller.abort();
    }
  }, [enabled, debounceMs, ...args]);

  return { data, loading, error, setData };
}
