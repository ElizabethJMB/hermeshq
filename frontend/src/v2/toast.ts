import { create } from "zustand";

export type V2ToastTone = "success" | "error" | "info";

export interface V2Toast {
  id: number;
  message: string;
  tone: V2ToastTone;
}

interface V2ToastState {
  toasts: V2Toast[];
  push: (message: string, tone?: V2ToastTone) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useV2ToastStore = create<V2ToastState>((set) => ({
  toasts: [],
  push: (message, tone = "info") => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { id, message, tone }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export const v2toast = {
  success: (message: string) => useV2ToastStore.getState().push(message, "success"),
  error: (message: string) => useV2ToastStore.getState().push(message, "error"),
  info: (message: string) => useV2ToastStore.getState().push(message, "info"),
};

export function extractErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { detail?: string } } }).response;
    if (response?.data?.detail) return response.data.detail;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
