import type { ReactNode } from 'react';
import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AuthUser, LoginPayload } from '@/Models/auth/types';
import { authStorage } from './authStorage';
import { useAuthStore } from './authStore';
import { authApi } from '@/services/api/authApi';
import { setUnauthorizedHandler } from '@/services/api/httpClient';

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
};

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const hasToken = useAuthStore((state) => state.hasToken);
  const clearSession = useAuthStore((state) => state.clearSession);
  const setSession = useAuthStore((state) => state.setSession);
  const setHasToken = useAuthStore((state) => state.setHasToken);

  const clearAuth = useCallback(() => {
    authStorage.clearToken();
    clearSession();
    queryClient.removeQueries({ queryKey: ['auth'] });
  }, [clearSession, queryClient]);

  useEffect(() => {
    setHasToken(Boolean(authStorage.getToken()));
  }, [setHasToken]);

  useEffect(() => {
    setUnauthorizedHandler(clearAuth);

    return () => setUnauthorizedHandler(null);
  }, [clearAuth]);

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.me,
    enabled: hasToken,
    retry: false,
  });

  useEffect(() => {
    if (meQuery.data?.user) {
      setSession({ user: meQuery.data.user, hasToken: true });
    } else if (meQuery.isError) {
      clearAuth();
    }
  }, [clearAuth, meQuery.data?.user, meQuery.isError, setSession]);

  return <>{children}</>;
}

export function useAuth() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const hasToken = useAuthStore((state) => state.hasToken);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  const setHasToken = useAuthStore((state) => state.setHasToken);

  const clearAuth = useCallback(() => {
    authStorage.clearToken();
    clearSession();
    queryClient.removeQueries({ queryKey: ['auth'] });
  }, [clearSession, queryClient]);

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (response) => {
      authStorage.setTokens(response.access_token, response.refresh_token);
      setSession({ user: response.user, hasToken: true });
      queryClient.setQueryData(['auth', 'me'], { user: response.user });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSettled: clearAuth,
  });

  const login = useCallback(
    async (payload: LoginPayload) => {
      await loginMutation.mutateAsync(payload);
    },
    [loginMutation],
  );

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const isBootstrapping = hasToken && user === null;

  useEffect(() => {
    if (!hasToken && authStorage.getToken()) {
      setHasToken(true);
    }
  }, [hasToken, setHasToken]);

  const authState: AuthContextValue = {
    user,
    isAuthenticated: Boolean(user),
    isBootstrapping,
    login,
    logout,
  };

  return authState;
}
