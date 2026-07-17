import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "./client";
import type { PublicChatApiKey, PublicChatApiKeyCreated } from "../types/api";

export function usePublicChatKeys(enabled = true) {
  return useQuery({
    queryKey: ["public-chat-keys"],
    queryFn: async () => {
      const { data } = await apiClient.get<PublicChatApiKey[]>("/settings/public-chat-keys");
      return data;
    },
    enabled,
  });
}

export function useCreatePublicChatKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await apiClient.post<PublicChatApiKeyCreated>("/settings/public-chat-keys", payload);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["public-chat-keys"] });
    },
  });
}

export function useUpdatePublicChatKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ keyId, payload }: { keyId: string; payload: Record<string, unknown> }) => {
      const { data } = await apiClient.patch<PublicChatApiKey>(`/settings/public-chat-keys/${keyId}`, payload);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["public-chat-keys"] });
    },
  });
}

export function useDeletePublicChatKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (keyId: string) => {
      await apiClient.delete(`/settings/public-chat-keys/${keyId}`);
      return keyId;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["public-chat-keys"] });
    },
  });
}

export function usePermanentlyDeletePublicChatKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (keyId: string) => {
      await apiClient.delete(`/settings/public-chat-keys/${keyId}/permanent`);
      return keyId;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["public-chat-keys"] });
    },
  });
}
