// Minimal RFC-4180 CSV export helpers (client-side, no deps).

function cell(v: any): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  // Quote when the value contains a delimiter, quote or newline.
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export interface CsvColumn { key: string; label: string; }

/** Build a CSV string from rows + ordered column definitions. */
export function toCsv(columns: CsvColumn[], rows: any[]): string {
  const header = columns.map((c) => cell(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => cell(row[c.key])).join(',')).join('\n');
  return body ? `${header}\n${body}` : header;
}

/** Trigger a browser download of the given CSV text. */
export function downloadCsv(csv: string, filename: string): void {
  // Prepend BOM so Excel detects UTF-8.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
