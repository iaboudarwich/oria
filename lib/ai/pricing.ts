/**
 * Rough USD cost estimation for Anthropic calls.
 *
 * Pricing changes on Anthropic's side from time to time; treat this as
 * an estimate, not invoiced cost. The admin page labels it as such. If
 * a model isn't in the table we fall back to Sonnet rates as a safe
 * upper bound, better to over-estimate than under-report.
 *
 * Rates are per-1M-tokens, matching Anthropic's public pricing.
 */

type Rate = { input: number; output: number };

const RATES: Array<{ match: RegExp; rate: Rate }> = [
  // Opus family, premium
  { match: /opus-4/i, rate: { input: 15, output: 75 } },
  // Sonnet family, balanced
  { match: /sonnet-4/i, rate: { input: 3, output: 15 } },
  // Haiku family, fast / cheap
  { match: /haiku-4/i, rate: { input: 1, output: 5 } },
];

const FALLBACK: Rate = { input: 3, output: 15 }; // Sonnet 4.6 rates

function rateFor(model: string): Rate {
  for (const r of RATES) if (r.match.test(model)) return r.rate;
  return FALLBACK;
}

export function estimatedCostUSD(model: string, inputTokens: number, outputTokens: number): number {
  const r = rateFor(model);
  const cost = (inputTokens / 1_000_000) * r.input + (outputTokens / 1_000_000) * r.output;
  // Round to four decimals, admin page displays as $0.0123.
  return Math.round(cost * 10000) / 10000;
}
