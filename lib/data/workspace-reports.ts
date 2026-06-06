import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";

/** Shape Claude returns when generating a report. */
export type ReportChartSeries = {
  label: string;
  data: Array<{ x: string; y: number }>;
};

export type ReportTable = {
  caption?: string;
  columns: string[];
  rows: string[][];
};

export type ReportChart =
  | {
      kind: "bar";
      caption?: string;
      series: ReportChartSeries[];
    }
  | {
      kind: "line";
      caption?: string;
      series: ReportChartSeries[];
    }
  | {
      kind: "table";
      caption?: string;
      table: ReportTable;
    };

export type ReportSection = {
  heading: string;
  body?: string;
  bullets?: string[];
  chart?: ReportChart;
};

export type ReportKeyMetric = {
  label: string;
  value: string;
  delta?: string;
};

export type ReportPayload = {
  summary: string;
  sections: ReportSection[];
  key_metrics?: ReportKeyMetric[];
};

export type WorkspaceReport = {
  id: string;
  organization_id: string;
  title: string;
  kind: string;
  prompt: string | null;
  period_start: string | null;
  period_end: string | null;
  payload: ReportPayload | null;
  status: "pending" | "ready" | "failed";
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * List reports for the active Workspace. Office orgs only; returns []
 * for personal/circle and on any DB error so the page renders cleanly.
 */
export async function listWorkspaceReports(limit = 20): Promise<WorkspaceReport[]> {
  const ctx = await requireContext();
  if (ctx.organization.kind !== "office") return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_reports")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as WorkspaceReport[];
}

export async function getWorkspaceReport(id: string): Promise<WorkspaceReport | null> {
  const ctx = await requireContext();
  if (ctx.organization.kind !== "office") return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_reports")
    .select("*")
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (error || !data) return null;
  return data as WorkspaceReport;
}
