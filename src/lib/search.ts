// Shared helpers for the "q" free-text search boxes across the admin list
// pages and reports. Postgres `contains` is case-sensitive by default, so
// every text match needs `mode: "insensitive"` explicitly. A query can also
// arrive padded with whitespace (copy-pasted) or, for phone search, typed
// with formatting ("+91 918-741-1327") that plain digit-stored phone
// numbers don't have — these normalize both before building a `where`.

export function normalizeSearchQuery(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

// Strips everything but digits — phone numbers are stored as plain digit
// strings, so a query typed with a country code, spaces or dashes needs the
// same stripped down before it can match.
export function phoneSearchDigits(q: string): string | undefined {
  const digits = q.replace(/\D/g, "");
  return digits || undefined;
}
