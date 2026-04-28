import type { AuthMeResponse, LoginPayload, LoginResponse } from "@/Models/auth/types";

import { httpClient } from "./httpClient";

export const authApi = {
  async login(payload: LoginPayload): Promise<LoginResponse> {
    const { data } = await httpClient.post<LoginResponse>("/auth/login", payload);

    return data;
  },
  async me(): Promise<AuthMeResponse> {
    const { data } = await httpClient.get<AuthMeResponse>("/auth/me");

    return data;
  },
  async logout(): Promise<void> {
    await httpClient.post("/auth/logout");
  },
  async refresh(refreshToken: string): Promise<LoginResponse> {
    const { data } = await httpClient.post<LoginResponse>("/auth/refresh", {
      refresh_token: refreshToken,
    });

    return data;
  },
  async updateProfile(formData: FormData): Promise<AuthMeResponse> {
    const { data } = await httpClient.post<AuthMeResponse>("/auth/profile", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return data;
  },
  async ssoExchange(ssoToken: string): Promise<LoginResponse> {
    const { data } = await httpClient.post<LoginResponse>("/auth/sso-exchange", {
      sso_token: ssoToken,
    });

    return data;
  },
};
