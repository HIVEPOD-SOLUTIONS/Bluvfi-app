import { useCallback } from 'react';
import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

/** Returns a function that calls bluvfi's API with the current Privy access token attached. */
export function useApiClient() {
  const { getAccessToken } = useAuth();

  return useCallback(
    async <T>(path: string, options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; query?: Record<string, string | number | undefined> } = {}) => {
      const token = await getAccessToken();
      return apiRequest<T>(path, { ...options, token });
    },
    [getAccessToken],
  );
}

/** react-query wrapper for an authenticated GET request. */
export function useApiQuery<T>(
  queryKey: readonly unknown[],
  path: string,
  queryParams?: Record<string, string | number | undefined>,
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>,
) {
  const call = useApiClient();
  return useQuery<T>({
    queryKey,
    queryFn: () => call<T>(path, { query: queryParams }),
    ...options,
  });
}
