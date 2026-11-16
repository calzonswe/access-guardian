import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { t, setLanguage, getLanguage } from '@/i18n';
import EN from '@/i18n/en';

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'ui' || d.name === 'i18n' ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(d.name) && !/\.test\./.test(d.name) ? [p] : [];
  });
}

describe('i18n', () => {
  it('every t() text in the source has an English translation', () => {
    const missing: string[] = [];
    const re = /\btr?\('((?:[^'\\]|\\.)*)'/g;
    for (const file of sourceFiles(path.resolve(__dirname, '..'))) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(re)) {
        const key = m[1].replace(/\\'/g, "'").replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
        if (!(key in EN)) missing.push(`${path.relative(process.cwd(), file)}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('translates, fills placeholders and falls back to Swedish', () => {
    setLanguage('en', { reload: false });
    expect(getLanguage()).toBe('en');
    expect(t('Ansökningar')).toBe('Applications');
    expect(t('Godkänn {n}', { n: 3 })).toBe('Approve 3');
    expect(t('Text som inte finns')).toBe('Text som inte finns');
    setLanguage('sv', { reload: false });
    expect(t('Ansökningar')).toBe('Ansökningar');
    expect(t('Godkänn {n}', { n: 3 })).toBe('Godkänn 3');
  });
});
