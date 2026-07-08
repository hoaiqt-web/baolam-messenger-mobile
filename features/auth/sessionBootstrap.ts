import { isAxiosError } from 'axios';

import { authStorage } from '@/features/auth/authStorage';
import { authApi } from '@/services/api/authApi';
import { env } from '@/shared/config/env';
import axios from 'axios';

const refreshClient = axios.create({
  baseURL: env.apiBaseUrl,
  headers: { 'Content-Type': 'application/json' },
});

export type RefreshAccessTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; sessionExpired: boolean };

/** Refresh access token without going through httpClient interceptors. */
export async function refreshAccessTokenPair(): Promise<RefreshAccessTokenResult> {
  const refreshToken = authStorage.getRefreshToken();
  if (!refreshToken) {
    return { ok: false, sessionExpired: true };
  }

  try {
    const { data } = await refreshClient.post<{
      access_token: string;
      refresh_token: string;
    }>('/auth/refresh', { refresh_token: refreshToken });

    await authStorage.setTokens(data.access_token, data.refresh_token);
    return { ok: true, accessToken: data.access_token };
  } catch (error) {
    const sessionExpired = isAxiosError(error) && error.response?.status === 401;
    if (sessionExpired) {
      await authStorage.clearToken();
    }
    return { ok: false, sessionExpired };
  }
}

export type RestoreSessionResult = {
  authenticated: boolean;
  userId: number | null;
};

/**
 * Khôi phục phiên từ AsyncStorage khi mở app.
 * Chỉ đăng xuất khi refresh token hết hạn — không logout khi lỗi mạng tạm thời.
 */
export async function restoreAuthSession(): Promise<RestoreSessionResult> {
  await authStorage.init();
  const hasStoredSession = Boolean(authStorage.getToken() || authStorage.getRefreshToken());
  if (!hasStoredSession) {
    return { authenticated: false, userId: null };
  }

  try {
    const me = await authApi.me();
    return {
      authenticated: true,
      userId: Number(me.user?.id) || null,
    };
  } catch {
    const stillHasSession = Boolean(authStorage.getToken() || authStorage.getRefreshToken());
    if (!stillHasSession) {
      return { authenticated: false, userId: null };
    }
    // Token còn (mạng/server tạm lỗi) — giữ đăng nhập offline
    return { authenticated: true, userId: null };
  }
}

/** Ping session khi app quay lại foreground (access token ~1h sẽ được refresh tự động). */
export async function pingAuthSession(): Promise<void> {
  if (!authStorage.getToken() && !authStorage.getRefreshToken()) {
    return;
  }
  try {
    await authApi.me();
  } catch {
    // Interceptor xử lý refresh; không logout nếu chỉ lỗi mạng
  }
}
