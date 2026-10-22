// ISO week start (Monday, UTC) for a YYYY-MM-DD date. Same rule as the
// weekly-blog-publisher Worker's isoWeekStart.
export function isoWeekStart(dateText: string): string {
  const date = new Date(`${dateText}T00:00:00Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}
