export type CsvColumn<T> = { key: string; label: string; value: (row: T) => string | number | null | undefined };

// Minimal RFC 4180 CSV writer — quotes a field only when it contains a
// comma, quote, or newline, doubling any embedded quotes. CRLF row endings
// since that's what most spreadsheet tools (Excel included) expect.
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const escape = (value: string | number | null | undefined) => {
    const str = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const header = columns.map((c) => escape(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => escape(c.value(row))).join(","));
  return [header, ...lines].join("\r\n");
}

export function csvResponse(filename: string, csv: string) {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
