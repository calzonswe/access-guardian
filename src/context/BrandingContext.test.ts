import { describe, it, expect } from 'vitest';
import { isValidLogoUrl } from '@/context/BrandingContext';

describe('isValidLogoUrl', () => {
  it('accepts image locations', () => {
    expect(isValidLogoUrl('https://example.com/logo.png')).toBe(true);
    expect(isValidLogoUrl('/logo.svg')).toBe(true);
    expect(isValidLogoUrl('data:image/png;base64,AAAA')).toBe(true);
  });
  it('rejects plain text and other schemes', () => {
    expect(isValidLogoUrl('Access Test AB')).toBe(false);
    expect(isValidLogoUrl('javascript:alert(1)')).toBe(false);
    expect(isValidLogoUrl('')).toBe(false);
    expect(isValidLogoUrl(undefined)).toBe(false);
  });
});

import { brandColourCss } from '@/context/BrandingContext';

describe('brandColourCss', () => {
  it('leaves the theme tokens alone for the default or invalid colours', () => {
    expect(brandColourCss('#2563eb')).toBe('');
    expect(brandColourCss('#2563EB')).toBe('');
    expect(brandColourCss('not-a-colour')).toBe('');
    expect(brandColourCss(undefined)).toBe('');
  });
  it('lifts a dark brand colour for the dark theme', () => {
    const css = brandColourCss('#7c2d12'); // dark brown-red, ~28% lightness
    expect(css).toContain(':root{--primary:');
    expect(css).toMatch(/\.dark\{--primary:\d+ \d+% 62%/);
    expect(css).toContain(':root{--primary:15 75% 28%;--primary-foreground:0 0% 100%');
  });
  it('uses dark text on a light brand colour', () => {
    expect(brandColourCss('#fde047')).toMatch(/:root\{--primary:\d+ \d+% \d+%;--primary-foreground:\d+ 40% 8%/);
  });
});
