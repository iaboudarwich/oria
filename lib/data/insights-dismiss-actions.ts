"use server";

import {
  readDismissedInsightIds,
  writeDismissedInsightIds,
} from "./insights-dismiss";

/**
 * Add an insight id to the dismissed list so it doesn't reappear on
 * the next render. Idempotent.
 */
export async function dismissInsight(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const current = await readDismissedInsightIds();
  if (current.has(id)) return;
  current.add(id);
  await writeDismissedInsightIds(current);
}
