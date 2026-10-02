import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApiQuery } from './use-api';

const POLL_MS = 30_000;

/**
 * The user's persistent XRPL wallet. bluvfi's `/api/xrpl/sidebar-wallet` creates it on first call
 * (idempotent server-side), so this is safe to request every time the profile is opened.
 *
 * `unavailable` = the XRPL service isn't configured server-side (HTTP 501): hide the section
 * rather than show an error the user can't act on, same as the web sidebar.
 */
export function useXrplWallet() {
  const { userId } = useAuth();
  const query = useApiQuery<{ id: string; address: string }>(['xrpl-wallet', userId], '/api/xrpl/sidebar-wallet', undefined, {
    enabled: !!userId,
    staleTime: Infinity,
    retry: 1,
  });
  const unavailable = query.error instanceof ApiError && query.error.status === 501;
  return {
    address: query.data?.address,
    isLoading: query.isLoading,
    error: query.isError && !unavailable ? query.error : null,
    unavailable,
    refetch: query.refetch,
  };
}

/** Live XRP balance of the wallet, derived server-side via bluvfi-xrpl. Polls while mounted. */
export function useXrpBalance(enabled: boolean) {
  const { userId } = useAuth();
  const query = useApiQuery<{ balanceXrp: number }>(['xrpl-balance', userId], '/api/xrpl/balance', undefined, {
    enabled: enabled && !!userId,
    refetchInterval: POLL_MS,
    staleTime: POLL_MS,
    retry: false,
  });
  // 404 = no wallet yet, or one the XRPL service no longer knows (orphaned): hide the row instead of spinning.
  const orphaned = query.error instanceof ApiError && query.error.status === 404;
  return {
    balance: typeof query.data?.balanceXrp === 'number' ? query.data.balanceXrp : null,
    isLoading: query.isLoading,
    orphaned,
  };
}
