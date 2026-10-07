/**
 * Thin client for bluvfi's existing Next.js API (same backend the web app
 * uses — all business logic, provider integrations, and secrets stay
 * server-side there; this app never holds financial API keys itself).
 *
 * Auth: bluvfi's `verifyAuth()` (src/lib/auth.ts) checks the
 * `Authorization: Bearer <token>` header before falling back to cookies, so
 * a Privy access token from this app's PrivyProvider works directly against
 * the same endpoints the web app calls.
 */

import { getDeviceId } from '@/lib/device';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ?? 'https://www.bluvfi.xyz';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** A machine-readable reason some endpoints send alongside the message (e.g. 'creator_required'). */
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  query?: Record<string, string | number | undefined>;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, query } = options;

  let url = `${API_BASE_URL}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  // Which phone this is (a stable id; the server stores only a hash). Used to notice several accounts on one phone.
  const device = await getDeviceId();
  if (device) headers['X-Bluvfi-Device'] = device;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code: string | undefined;
    try {
      const data = await res.json();
      if (typeof data?.error === 'string') message = data.error;
      if (typeof data?.code === 'string') code = data.code;
    } catch {
      // response wasn't JSON — keep the generic message
    }
    throw new ApiError(res.status, message, code);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export { API_BASE_URL };
