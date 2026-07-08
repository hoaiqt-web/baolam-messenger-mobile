import axios from "axios";
import type { AxiosError, InternalAxiosRequestConfig } from "axios";

import { authStorage } from "@/features/auth/authStorage";
import { refreshAccessTokenPair, type RefreshAccessTokenResult } from "@/features/auth/sessionBootstrap";
import { getReverbSocketId } from "@/services/realtime/reverbClient";
import { env } from "@/shared/config/env";

type UnauthorizedHandler = () => void;
type TimingRequestConfig = InternalAxiosRequestConfig & {
  _requestStartedAtMs?: number;
  _traceId?: string;
};

let onUnauthorized: UnauthorizedHandler | null = null;

function createTraceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function logApiTiming(
  method: string | undefined,
  url: string | undefined,
  requestTraceId: string | undefined,
  responseTraceId: string | undefined,
  serverApiTimeMs: string | undefined,
  clientElapsedMs: number | undefined,
  status?: number
) {
  if (! env.chatLatencyEnabled) {
    return;
  }

  console.info("api_timing", {
    method: (method ?? "GET").toUpperCase(),
    url: url ?? "",
    status: status ?? 0,
    traceId: responseTraceId ?? requestTraceId ?? "",
    requestTraceId: requestTraceId ?? "",
    serverApiTimeMs: serverApiTimeMs ?? "",
    clientElapsedMs: clientElapsedMs ?? 0,
  });
}

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

export const httpClient = axios.create({
  baseURL: env.apiBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

let refreshRequest: Promise<RefreshAccessTokenResult> | null = null;

httpClient.interceptors.request.use((config) => {
  const requestConfig = config as TimingRequestConfig;
  const token = authStorage.getToken();
  if (token) {
    requestConfig.headers.Authorization = `Bearer ${token}`;
  }

  requestConfig._requestStartedAtMs = Date.now();
  requestConfig._traceId = createTraceId();
  requestConfig.headers["X-Trace-Id"] = requestConfig._traceId;
  // Attach WebSocket socket ID so Laravel Broadcasting can exclude the sender
  // from receiving their own broadcast events (prevents message duplication).
  const socketId = getReverbSocketId();
  if (socketId) {
    requestConfig.headers["X-Socket-Id"] = socketId;
  }

  return requestConfig;
});

httpClient.interceptors.response.use(
  (response) => {
    const requestConfig = response.config as TimingRequestConfig;
    const clientElapsedMs = requestConfig._requestStartedAtMs
      ? Date.now() - requestConfig._requestStartedAtMs
      : undefined;

    const serverApiTimeMs = response.headers["x-api-time-ms"] as string | undefined;
    const responseTraceId = response.headers["x-trace-id"] as string | undefined;

    logApiTiming(
      requestConfig.method,
      requestConfig.url,
      requestConfig._traceId,
      responseTraceId,
      serverApiTimeMs,
      clientElapsedMs,
      response.status
    );

    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as (RetryableRequestConfig & TimingRequestConfig) | undefined;

    if (originalRequest) {
      const clientElapsedMs = originalRequest._requestStartedAtMs
        ? Date.now() - originalRequest._requestStartedAtMs
        : undefined;
      const serverApiTimeMs = error.response?.headers?.["x-api-time-ms"] as string | undefined;
      const responseTraceId = error.response?.headers?.["x-trace-id"] as string | undefined;

      logApiTiming(
        originalRequest.method,
        originalRequest.url,
        originalRequest._traceId,
        responseTraceId,
        serverApiTimeMs,
        clientElapsedMs,
        error.response?.status
      );
    }

    if (error.response?.status === 401 && originalRequest && ! originalRequest._retry) {
      originalRequest._retry = true;
      refreshRequest ??= refreshAccessTokenPair().finally(() => {
        refreshRequest = null;
      });

      const refreshResult = await refreshRequest;
      if (refreshResult.ok) {
        originalRequest.headers.Authorization = `Bearer ${refreshResult.accessToken}`;

        return httpClient(originalRequest);
      }

      if (refreshResult.sessionExpired) {
        onUnauthorized?.();
      }

      return Promise.reject(error);
    }

    if (error?.response?.status === 401) {
      onUnauthorized?.();
    }

    return Promise.reject(error);
  }
);
