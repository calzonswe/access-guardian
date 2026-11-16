/**
 * Small dependency-free CSV reader/writer for the user import.
 * Handles what Swedish Excel produces: a BOM, ';' separators, CRLF line
 * endings and quoted fields (with "" for a quote and embedded line breaks).
 */

function detectSeparator(text: string): ';' | ',' {
  // Look at the header line only (outside quotes).
  let semis = 0, commas = 0, inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === '\n' || ch === '\r')) break;
    else if (!inQuotes && ch === ';') semis++;
    else if (!inQuotes && ch === ',') commas++;
  }
  return semis >= commas && semis > 0 ? ';' : ',';
}

function splitRecords(text: string, sep: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      record.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      record.push(field); field = '';
      records.push(record); record = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || record.length > 0) { record.push(field); records.push(record); }
  // Drop empty lines
  return records.filter(r => r.some(v => v.trim() !== ''));
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^\uFEFF/, '');
  if (!clean.trim()) return { headers: [], rows: [] };
  const records = splitRecords(clean, detectSeparator(clean));
  const headers = (records.shift() || []).map(h => h.trim().toLowerCase());
  const rows = records.map(values => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? '').trim(); });
    return row;
  });
  return { headers, rows };
}

function quote(value: string): string {
  return /[;"\r\n,]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** ';'-separated CSV with CRLF line endings (opens directly in Swedish Excel). */
export function toCsv(rows: Record<string, string>[], headers: string[]): string {
  const lines = [headers.map(quote).join(';')];
  for (const row of rows) lines.push(headers.map(h => quote(String(row[h] ?? ''))).join(';'));
  return lines.join('\r\n');
}
