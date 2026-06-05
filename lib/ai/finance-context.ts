import type { NetWorth } from "@/lib/net-worth/compute";

/**
 * Build the FINANCE CONTEXT block injected into the Ask system prompt so the
 * 1% Rule (lib/ai/agent.ts) can reason from the user's real net worth instead
 * of inventing one. Returns null when there is nothing real to state (no
 * holdings), so we never feed the model a fabricated zero.
 *
 * Pure + tested. The block is the user's own numbers, marked not-a-source so
 * the model does not cite it.
 */
export function buildFinanceContextBlock(nw: NetWorth): string | null {
  if (nw.netWorth === 0 && nw.totalAssets === 0) return null;
  const onePct = Math.round((nw.netWorth / 100) * 100) / 100;
  const fmt = (n: number) => `${Math.round(n).toLocaleString("en-US")} ${nw.currency}`;
  const lines = [
    "FINANCE CONTEXT (the user's own numbers; use for the 1% rule and affordability questions, do not cite as a source):",
    `Net worth: ${fmt(nw.netWorth)} (assets ${fmt(nw.totalAssets)}, debts ${fmt(nw.totalLiabilities)}).`,
    `1% of net worth is ${fmt(onePct)}. A purchase under that figure is a small decision; above it, weigh it.`,
  ];
  return lines.join("\n");
}
