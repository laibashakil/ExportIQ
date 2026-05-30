// Shared date/time formatting helpers for the web app.

/**
 * Coerce the many shapes an analysis timestamp can arrive in into a Date:
 *  - a Firestore Timestamp (has .toDate() or a numeric .seconds)
 *  - an ISO string (report.created_at is written as isoformat by the backend)
 *  - epoch milliseconds
 *  - an existing Date
 * Returns null for anything missing or unparseable.
 */
export function toDateSafe(value) {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      try {
        const d = value.toDate();
        return Number.isNaN(d.getTime()) ? null : d;
      } catch {
        return null;
      }
    }
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
    return null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format an analysis timestamp as "May 20, 2026 at 3:07 PM".
 * Returns null when there is no valid date to format.
 */
export function formatAnalyzedAt(value) {
  const d = toDateSafe(value);
  if (!d) return null;
  const date = d.toLocaleDateString('en-US', { dateStyle: 'medium' });
  const time = d.toLocaleTimeString('en-US', { timeStyle: 'short' });
  return `${date} at ${time}`;
}
