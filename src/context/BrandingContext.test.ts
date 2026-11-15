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
