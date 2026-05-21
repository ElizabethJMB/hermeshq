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

export interface FleetHealthStatus {
  status_breakdown: Record<string, number>;
  task_summary: Record<string, number>;
  recent_errors: Array<{
    agent_id: string | null;
    agent_name: string;
    message: string | null;
    timestamp: string | null;
  }>;
  last_updated: string;
}

export function useFleetHealth() {
  return useQuery({
    queryKey: ["dashboard", "health"],
    queryFn: async () => {
      const { data } = await apiClient.get<FleetHealthStatus>("/dashboard/health");
      return data;
    },
    refetchInterval: 10_000,
  });
}

export interface TaskAnalytics {
  time_series: Record<string, Record<string, number>>;
  completion_metrics: {
    avg_seconds: number;
    p50_seconds: number;
    p95_seconds: number;
  };
  totals: {
    total: number;
    failed: number;
    success_rate: number;
  };
  top_failing_agents: Array<{
    agent_id: string;
    agent_name: string;
    fail_count: number;
  }>;
  period_days: number;
}

export function useTaskAnalytics(days: number = 14) {
  return useQuery({
    queryKey: ["dashboard", "analytics", days],
    queryFn: async () => {
      const { data } = await apiClient.get<TaskAnalytics>("/dashboard/analytics", {
        params: { days },
      });
      return data;
    },
    refetchInterval: 30_000,
  });
}

