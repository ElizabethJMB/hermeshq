import { create } from "zustand";

import type { User } from "../types/api";
import { decodeJwtPayload } from "./jwtHelpers";

function safeReadLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteLocalStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Silently ignore in private browsing mode (Safari, etc.)
  }
}

function safeRemoveLocalStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Silently ignore
  }
}

interface SessionState {
  token: string | null;
  user: User | null;
  setSession: (token: string, user: User | null) => void;
  setUser: (user: User | null) => void;
  setToken: (token: string) => void;
  logout: () => void;
}

// Validate stored token — discard if expired
const storedToken = (() => {
  const raw = safeReadLocalStorage("hermeshq.token");
  if (raw && decodeJwtPayload(raw)) return raw;
  if (raw) safeRemoveLocalStorage("hermeshq.token");
  return null;
})();

export const useSessionStore = create<SessionState>((set) => ({
  token: storedToken,
  user: null,
  setSession: (token, user) => {
    safeWriteLocalStorage("hermeshq.token", token);
    set({ token, user });
  },
  setUser: (user) => set({ user }),
  setToken: (token) => {
    safeWriteLocalStorage("hermeshq.token", token);
    set({ token });
  },
  logout: () => {
    safeRemoveLocalStorage("hermeshq.token");
    set({ token: null, user: null });
  },
}));
