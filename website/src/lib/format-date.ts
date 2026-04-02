/**
 * Format a date string without timezone shifting.
 *
 * JavaScript's `new Date("2026-04-02")` interprets date-only strings as UTC midnight,
 * which displays as the previous day in US timezones (EST = UTC-5).
 *
 * This function parses the date string directly and formats it as M/D/YYYY
 * without going through the Date constructor's timezone logic.
 */
export function formatDate(dateStr: string): string {
  if (!dateStr) return "—";

  // Handle ISO datetime strings (e.g. "2026-04-02T04:14:30.057Z")
  const datePart = dateStr.split("T")[0];

  // Parse YYYY-MM-DD directly
  const parts = datePart.split("-");
  if (parts.length === 3) {
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    const year = parseInt(parts[0], 10);
    return `${month}/${day}/${year}`;
  }

  // Fallback for other formats
  return dateStr;
}
