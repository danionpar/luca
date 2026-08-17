/**
 * Small, pure YYYY-MM helpers shared by `monthly_summary` (previous month,
 * trailing average window) and `projected_commitments` (future billing
 * months). Kept dependency-free and unit-tested since calendar month
 * arithmetic is an easy place to be off-by-one.
 */

const YEAR_MONTH_PATTERN = /^\d{4}-\d{2}$/;

export function isValidYearMonth(value: string): boolean {
  if (!YEAR_MONTH_PATTERN.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

/** Shifts a "YYYY-MM" string by `delta` months (negative moves backward). */
export function shiftYearMonth(yearMonth: string, delta: number): string {
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  const zeroBasedTotal = year * 12 + (month - 1) + delta;
  const shiftedYear = Math.floor(zeroBasedTotal / 12);
  const shiftedMonth = ((zeroBasedTotal % 12) + 12) % 12;
  return `${shiftedYear.toString().padStart(4, "0")}-${(shiftedMonth + 1).toString().padStart(2, "0")}`;
}

/** Lists the `count` months strictly before `yearMonth`, oldest first. */
export function precedingYearMonths(yearMonth: string, count: number): string[] {
  const months: string[] = [];
  for (let i = count; i >= 1; i--) {
    months.push(shiftYearMonth(yearMonth, -i));
  }
  return months;
}
