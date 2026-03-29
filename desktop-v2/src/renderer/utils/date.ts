/**
 * Format a SQLite datetime string for display.
 *
 * SQLite stores timestamps as "2026-03-29 17:54:00" (no timezone info).
 * These are already in local time (via datetime('now','localtime')).
 *
 * We parse manually to avoid JS Date() interpreting as UTC.
 */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return 'Never';
  try {
    // Parse "YYYY-MM-DD HH:MM:SS" manually to avoid timezone conversion
    const parts = value.replace('T', ' ').split(/[- :]/);
    if (parts.length >= 6) {
      const d = new Date(
        parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]),
        parseInt(parts[3]), parseInt(parts[4]), parseInt(parts[5])
      );
      return d.toLocaleString();
    }
    if (parts.length >= 3) {
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      return d.toLocaleDateString();
    }
    return value;
  } catch {
    return value;
  }
}
