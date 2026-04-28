import { create } from "zustand";

import type { AuthUser } from "@/Models/auth/types";

type AuthState = {
  user: AuthUser | null;
  hasToken: boolean;
  setSession: (payload: { user: AuthUser; hasToken?: boolean }) => void;
  setHasToken: (hasToken: boolean) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  hasToken: false,
  setSession: ({ user, hasToken = true }) => set({ user, hasToken }),
  setHasToken: (hasToken) => set({ hasToken }),
  clearSession: () => set({ user: null, hasToken: false }),
}));
