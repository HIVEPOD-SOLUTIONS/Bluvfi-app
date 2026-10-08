import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import type { Payment } from '@/lib/api-types';
import { isPendingStatus, verifyPayment } from '@/lib/payments/settle';
import { useApiClient } from './use-api';

/** Poll fast while anything is still in flight, slowly otherwise (so a new payment still shows up). */
const FAST_MS = 5_000;
const IDLE_MS = 30_000;

/** Bitrefill invoices expire after 180 minutes; a bill still pending past that never will complete. */
const BILL_EXPIRY_MS = 180 * 60 * 1000;

/** How often each pending row is re-checked on-chain. */
const VERIFY_EVERY_MS = 20_000;

/** The normalized status the UI works with (card funding is stored as "submitted" / "confirmed"). */
export function normalizeStatus(status: string): 'pending' | 'processing' | 'completed' | 'failed' {
  if (status === 'completed' || status === 'confirmed' || status === 'paid') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'processing') return 'processing';
  return 'pending';
}

/**
 * The user's payment history, kept live: refetches every 5s while anything is pending, asks the server to sync
 * pending bills with Bitrefill, expires bills pending past their invoice window, and verifies other pending rows
 * (card funding, transfers) against the chain. Settled rows are written back so the web agrees.
 */
export function useHistory() {
  const call = useApiClient();
  const { evmAddress } = useAuth();
  const qc = useQueryClient();
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const syncing = useRef(false);
  const handled = useRef<Set<string>>(new Set());
  const lastVerified = useRef<Record<string, number>>({});

  const query = useQuery<{ payments: Payment[] }>({
    queryKey: ['payments', 'all'],
    queryFn: () => call<{ payments: Payment[] }>('/api/payments', { query: { limit: 100 } }),
    refetchInterval: (q) => (q.state.data?.payments.some((p) => isPendingStatus(p.status)) ? FAST_MS : IDLE_MS),
    staleTime: FAST_MS - 1_000,
  });

  // The same list Home counts its purchases from (shares its cache). History is the union of the two, so a purchase counted on Home is always listed here.
  const bills = useQuery<{ payments: Payment[] }>({
    queryKey: ['payments', 'bill'],
    queryFn: () => call<{ payments: Payment[] }>('/api/payments', { query: { type: 'bill', limit: 100 } }),
    staleTime: FAST_MS - 1_000,
  });

  const refetch = query.refetch;
  const merged = new Map<string, Payment>();
  for (const p of [...(query.data?.payments ?? []), ...(bills.data?.payments ?? [])]) merged.set(p.id, p);
  const payments = [...merged.values()]
    .sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())
    .map((p) => (overrides[p.id] ? { ...p, status: overrides[p.id] } : p));
  const pending = payments.filter((p) => isPendingStatus(p.status));

  const writeBack = useCallback(
    async (p: Payment, status: 'completed' | 'failed', txHash?: string) => {
      setOverrides((o) => ({ ...o, [p.id]: status }));
      // Best-effort: the row id works against a backend that supports it; an older one just rejects and we keep the local result.
      try {
        await call('/api/payments', { method: 'PATCH', body: { id: p.id, status, ...(txHash ? { txHash } : {}) } });
        qc.invalidateQueries({ queryKey: ['payments'] });
      } catch {
        /* keep the local override */
      }
    },
    [call, qc],
  );

  // Pending bills: have the server check Bitrefill, then refresh.
  const hasPendingBill = pending.some((p) => p.type === 'bill');
  useEffect(() => {
    if (!hasPendingBill) return;
    const run = async () => {
      if (syncing.current) return;
      syncing.current = true;
      try {
        await call('/api/payments/sync', { method: 'POST' });
        await refetch();
        qc.invalidateQueries({ queryKey: ['payments', 'bill'] });
      } catch {
        /* try again next cycle */
      } finally {
        syncing.current = false;
      }
    };
    run();
    const id = setInterval(run, FAST_MS * 2);
    return () => clearInterval(id);
  }, [hasPendingBill, call, refetch, qc]);

  // Pending too long: expire bills past their invoice window, and verify everything else on-chain.
  useEffect(() => {
    if (pending.length === 0) return;
    const run = async () => {
      const now = Date.now();
      for (const p of pending) {
        if (handled.current.has(p.id)) continue;
        const age = now - new Date(p.createdAt).getTime();

        if (p.type === 'bill') {
          if (p.referenceId && age > BILL_EXPIRY_MS) {
            handled.current.add(p.id);
            call('/api/payments', { method: 'PATCH', body: { referenceId: p.referenceId, status: 'failed' } })
              .then(() => refetch())
              .catch(() => handled.current.delete(p.id));
          }
          continue;
        }

        if (now - (lastVerified.current[p.id] ?? 0) < VERIFY_EVERY_MS) continue;
        lastVerified.current[p.id] = now;
        const verdict = await verifyPayment(p, evmAddress ?? null);
        if (verdict) {
          handled.current.add(p.id);
          await writeBack(p, verdict.status, verdict.txHash);
        }
      }
    };
    run();
    const id = setInterval(run, FAST_MS);
    return () => clearInterval(id);
    // `pending` is rebuilt each render; its identity-relevant content is the ids/statuses below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.map((p) => `${p.id}:${p.status}`).join(','), call, refetch, writeBack, evmAddress]);

  return { payments, pendingCount: pending.length, isLoading: query.isLoading && bills.isLoading, isError: query.isError && bills.isError, refetch };
}

export interface WeeklyInsight {
  id: string;
  weekStart: string;
  summary: string;
  totalSpentUsd: string;
  topCategory: string | null;
  balanceDeltaUsd: string;
}

/** ISO date of the most recent Monday (UTC), to tell whether the stored insight is from this week. */
function currentWeekStart(): string {
  const d = new Date();
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

/** The AI weekly spending summary. Generates one automatically when none exists for this week. */
export function useWeeklyInsight() {
  const call = useApiClient();
  const qc = useQueryClient();
  const asked = useRef(false);

  const query = useQuery<{ insight: WeeklyInsight | null }>({
    queryKey: ['weekly-insight'],
    queryFn: () => call<{ insight: WeeklyInsight | null }>('/api/insights/weekly'),
    staleTime: 5 * 60_000,
  });

  const generate = useMutation({
    mutationFn: () => call<{ insight: WeeklyInsight }>('/api/insights/weekly', { method: 'POST' }),
    onSuccess: (data) => qc.setQueryData(['weekly-insight'], { insight: data.insight }),
  });

  const loaded = query.isSuccess;
  const stale = loaded && (!query.data.insight || query.data.insight.weekStart !== currentWeekStart());
  useEffect(() => {
    if (stale && !asked.current) {
      asked.current = true;
      generate.mutate();
    }
  }, [stale, generate]);

  return {
    insight: query.data?.insight ?? null,
    isLoading: query.isLoading,
    isGenerating: generate.isPending,
    // A 429 carries the server's own wording ("daily insights limit… resets in about 5 hours"); anything else is generic.
    error: generate.isError ? (generate.error instanceof Error && generate.error.message ? generate.error.message : 'Could not generate your insight right now.') : null,
    generate: () => generate.mutate(),
  };
}
