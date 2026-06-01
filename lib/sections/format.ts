// Small shared formatters for the section summary + intelligence surfaces.
// Consolidated in the round-3 audit (previously duplicated across the
// generators and the bills/trips/health views).

export function money(value: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${Math.round(value)}`;
  }
}

/** "Jun 6, 2026" style. Returns the input unchanged if unparseable. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}
