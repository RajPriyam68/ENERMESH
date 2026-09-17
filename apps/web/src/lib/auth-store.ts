"use client";

import { create } from "zustand";
import type { AuthTokens, PublicUser } from "@enermesh/shared";
import { ApiError, apiRequest } from "./api";

export type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

interface SessionPayload {
  user: PublicUser;
  tokens: AuthTokens;
}

interface AuthState {
  user: PublicUser | null;
  accessToken: string | null;
  accessExpiresAt: string | null;
  status: AuthStatus;
  error: string | null;
  bootstrap: () => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<PublicUser>;
  register: (input: {
    email: string;
    password: string;
    displayName: string;
    role: "BUYER" | "SELLER";
  }) => Promise<PublicUser>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: PublicUser) => void;
  clearError: () => void;
}

function messageFrom(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

function applySession(set: (partial: Partial<AuthState>) => void, session: SessionPayload) {
  set({
    user: session.user,
    accessToken: session.tokens.accessToken,
    accessExpiresAt: session.tokens.accessExpiresAt,
    status: "authenticated",
    error: null,
  });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  accessExpiresAt: null,
  status: "idle",
  error: null,

  clearError: () => set({ error: null }),

  /**
   * Rehydrates an in-memory session from the httpOnly refresh cookie. Access
   * tokens are never read from or written to localStorage.
   */
  bootstrap: async () => {
    if (get().status === "loading") return;
    set({ status: "loading", error: null });
    try {
      const session = await apiRequest<SessionPayload>("/auth/refresh", { method: "POST", body: {} });
      applySession(set, session);
    } catch {
      set({ user: null, accessToken: null, accessExpiresAt: null, status: "unauthenticated" });
    }
  },

  login: async (input) => {
    set({ status: "loading", error: null });
    try {
      const session = await apiRequest<SessionPayload>("/auth/login", { method: "POST", body: input });
      applySession(set, session);
      return session.user;
    } catch (error) {
      set({ status: "unauthenticated", error: messageFrom(error) });
      throw error;
    }
  },

  register: async (input) => {
    set({ status: "loading", error: null });
    try {
      const session = await apiRequest<SessionPayload>("/auth/register", { method: "POST", body: input });
      applySession(set, session);
      return session.user;
    } catch (error) {
      set({ status: "unauthenticated", error: messageFrom(error) });
      throw error;
    }
  },

  refresh: async () => {
    try {
      const session = await apiRequest<SessionPayload>("/auth/refresh", { method: "POST", body: {} });
      applySession(set, session);
    } catch {
      set({ user: null, accessToken: null, accessExpiresAt: null, status: "unauthenticated" });
    }
  },

  logout: async () => {
    const token = get().accessToken;
    try {
      await apiRequest("/auth/logout", { method: "POST", token, body: {} });
    } catch {
      // Even if the server call fails, drop the local session.
    }
    set({ user: null, accessToken: null, accessExpiresAt: null, status: "unauthenticated", error: null });
  },

  setUser: (user) => set({ user }),
}));
