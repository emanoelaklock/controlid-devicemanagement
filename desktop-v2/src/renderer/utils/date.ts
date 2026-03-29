/**
 * Format a SQLite datetime string as local time.
 * SQLite datetime('now','localtime') returns "2026-03-29 12:00:00" without timezone.
 * new Date("2026-03-29 12:00:00") in JS interprets this as UTC, adding timezone offset.
 * Fix: replace space with 'T' and append timezone offset to treat as local time.
 */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return 'Never';
  try {
    // If it doesn't have timezone info, treat as local time
    // by NOT letting JS interpret it as UTC
    const d = value.includes('T') || value.includes('Z')
      ? new Date(value)
      : new Date(value.replace(' ', 'T') + getLocalOffsetString());
    return d.toLocaleString();
  } catch {
    return value;
  }
}

function getLocalOffsetString(): string {
  const offset = new Date().getTimezoneOffset();
  const sign = offset <= 0 ? '+' : '-';
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
  const minutes = String(Math.abs(offset) % 60).padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}
