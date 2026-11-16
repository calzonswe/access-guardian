import { describe, it, expect } from 'vitest';
import { parseCsv, toCsv } from '@/lib/csv';

describe('parseCsv', () => {
  it('reads a Swedish Excel file (BOM, semicolons, CRLF)', () => {
    const text = '﻿Email;Fornamn;Efternamn\r\nanna@foretag.se;Anna;Berg\r\n\r\nbo@foretag.se;Bo;Ek\r\n';
    const { headers, rows } = parseCsv(text);
    expect(headers).toEqual(['email', 'fornamn', 'efternamn']);
    expect(rows).toEqual([
      { email: 'anna@foretag.se', fornamn: 'Anna', efternamn: 'Berg' },
      { email: 'bo@foretag.se', fornamn: 'Bo', efternamn: 'Ek' },
    ]);
  });

  it('reads comma-separated files', () => {
    const { rows } = parseCsv('email,fornamn\nx@y.se,Xa\n');
    expect(rows).toEqual([{ email: 'x@y.se', fornamn: 'Xa' }]);
  });

  it('handles quoted fields with separators, quotes and line breaks', () => {
    const { rows } = parseCsv('email;befattning;roller\nx@y.se;"Chef; drift ""Nord""";"Linjechef|Anställd"\ny@y.se;"Två\nrader";Anställd\n');
    expect(rows[0]).toEqual({ email: 'x@y.se', befattning: 'Chef; drift "Nord"', roller: 'Linjechef|Anställd' });
    expect(rows[1].befattning).toBe('Två\nrader');
  });

  it('returns nothing for an empty file', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
  });
});

describe('toCsv', () => {
  it('quotes fields that need it and round-trips', () => {
    const rows = [{ a: 'x;y', b: 'he said "hi"' }, { a: 'plain', b: '' }];
    const text = toCsv(rows, ['a', 'b']);
    expect(text.split('\r\n')[1]).toBe('"x;y";"he said ""hi"""');
    expect(parseCsv(text).rows).toEqual(rows);
  });
});
