import { describe, it, expect } from 'vitest';
import { normalize, matches } from '@/lib/search';

describe('search', () => {
  it('ignores case and Swedish/other diacritics', () => {
    expect(normalize('Östra Lagret')).toBe('ostra lagret');
    expect(normalize('Åsa Ängström')).toBe('asa angstrom');
  });
  it('matches every word in any order', () => {
    expect(matches('lag ost', 'Östra Lagret')).toBe(true);
    expect(matches('erik lager', 'Erik Anställd', 'Lager Nord')).toBe(true);
    expect(matches('nord', 'Lager Syd')).toBe(false);
  });
  it('an empty query matches nothing', () => {
    expect(matches('', 'anything')).toBe(false);
    expect(matches('   ', 'anything')).toBe(false);
  });
});
