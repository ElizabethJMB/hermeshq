import { useQuery } from "@tanstack/react-query";

import { apiClient } from "./client";
import type { DashboardOverview } from "../types/api";

export interface DashboardChannel {
  agent_id: string;
  agent_name: string;
  agent_slug: string;
  platform: string;
  enabled: boolean;
  status: string;
  paired_at: string | null;
  days_since_paired: number | null;
}

export function useDashboardChannels() {
  return useQuery({
    queryKey: ["dashboard", "channels"],
    queryFn: async () => {
      const res = await apiClient.get("/dashboard/channels");
      return res.data as DashboardChannel[];
    },
  });
}

export function useDashboardOverview() {
  return useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: async () => {
      const { data } = await apiClient.get<DashboardOverview>("/dashboard/overview");
      return data;
    },
    refetchInterval: 5000,
  });
}

