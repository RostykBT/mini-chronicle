import { addDays, differenceInCalendarDays, eachMonthOfInterval, eachYearOfInterval, format, parseISO } from "date-fns";

/**
 * A piecewise-linear time scale where every gap between events gets width
 * ∝ log(1 + days). Ten empty years then take about as much room as a few busy
 * months, so the 2015 build date and the 2026 history both stay readable.
 */
export function makeScale(start: Date, end: Date, eventDates: string[]) {
  const span = differenceInCalendarDays(end, start);
  const knots = [...new Set([0, span, ...eventDates.map((d) => differenceInCalendarDays(parseISO(d), start))])]
    .filter((d) => d >= 0 && d <= span)
    .sort((a, b) => a - b);
  const weights = knots.slice(1).map((d, i) => Math.max(1.2, Math.log1p(d - knots[i])));
  const total = weights.reduce((a, b) => a + b, 0);
  const cum = [0];
  for (const w of weights) cum.push(cum.at(-1)! + w / total);

  /** Day offset → position 0..1 */
  const fromDays = (days: number) => {
    if (days <= 0) return 0;
    if (days >= span) return 1;
    let i = 0;
    while (knots[i + 1] < days) i++;
    return cum[i] + ((days - knots[i]) / (knots[i + 1] - knots[i])) * (cum[i + 1] - cum[i]);
  };
  /** Position 0..1 → day offset */
  const toDays = (f: number) => {
    if (f <= 0) return 0;
    if (f >= 1) return span;
    let i = 0;
    while (cum[i + 1] < f) i++;
    return Math.round(knots[i] + ((f - cum[i]) / (cum[i + 1] - cum[i])) * (knots[i + 1] - knots[i]));
  };

  const pos = (iso: string) => fromDays(differenceInCalendarDays(parseISO(iso), start));
  const dateAt = (f: number) => format(addDays(start, toDays(f)), "yyyy-MM-dd");

  /** Year ticks first, then months wherever there is room (≥ minGap apart). */
  const ticks = (minGap = 0.045) => {
    const kept: { f: number; label: string; major: boolean }[] = [];
    const tryAdd = (d: Date, label: string, major: boolean) => {
      const f = fromDays(differenceInCalendarDays(d, start));
      if (f <= 0.01 || f >= 0.99) return;
      if (kept.some((k) => Math.abs(k.f - f) < minGap)) return;
      kept.push({ f, label, major });
    };
    for (const y of eachYearOfInterval({ start, end })) tryAdd(y, format(y, "yyyy"), true);
    for (const m of eachMonthOfInterval({ start, end })) if (m.getMonth() !== 0) tryAdd(m, format(m, "MMM"), false);
    return kept.sort((a, b) => a.f - b.f);
  };

  return { pos, dateAt, ticks };
}
