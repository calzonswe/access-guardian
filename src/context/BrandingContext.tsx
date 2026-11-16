import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import * as store from '@/services/dataStore';
import { t } from '@/i18n';

interface BrandingState {
  appName: string;
  subtitle: string;
  logoUrl: string;
  primaryColor: string;
  selfRegistration: boolean;
}

/** Only real image locations count as a logo; anything else falls back to the icon. */
export function isValidLogoUrl(url: string | undefined): boolean {
  if (!url) return false;
  return /^https?:\/\/\S+$/i.test(url) || /^\/\S*$/.test(url) || /^data:image\//i.test(url);
}

interface BrandingContextType extends BrandingState {
  refresh: () => Promise<void>;
}

const defaults: BrandingState = {
  appName: 'RBAC Access',
  subtitle: t('Tillträdeshantering'),
  logoUrl: '',
  primaryColor: '#2563eb',
  selfRegistration: true,
};

const BrandingContext = createContext<BrandingContextType>({ ...defaults, refresh: async () => {} });

function hexToHsl(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const BRAND_STYLE_ID = 'brand-colour';

/**
 * Per-theme --primary for a brand colour, as CSS text. Exported for tests.
 * - Light theme: the colour as chosen (capped so white/dark text stays readable).
 * - Dark theme: same hue, lifted to at least 62% lightness so it reads on dark surfaces.
 * Returns '' for the default colour or an invalid value, so the theme's own tokens apply.
 */
export function brandColourCss(hex: string | undefined): string {
  if (!hex || hex.toLowerCase() === defaults.primaryColor.toLowerCase()) return '';
  const hsl = hexToHsl(hex);
  if (!hsl) return '';
  const [h, sat, lig] = hsl.split(' ');
  const l = parseInt(lig);
  const fg = (lightness: number) => (lightness > 55 ? `${h} 40% 8%` : '0 0% 100%');
  const darkL = Math.max(l, 62);
  return `:root{--primary:${h} ${sat} ${l}%;--primary-foreground:${fg(l)};}` +
    `.dark{--primary:${h} ${sat} ${darkL}%;--primary-foreground:${fg(darkL)};}`;
}

function applyPrimaryColor(hex: string) {
  // Clean up the old inline override (earlier versions wrote it on <html>).
  document.documentElement.style.removeProperty('--primary');
  document.documentElement.style.removeProperty('--primary-foreground');
  let el = document.getElementById(BRAND_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = BRAND_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = brandColourCss(hex);
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingState>(defaults);

  const load = useCallback(async () => {
    try {
      await store.initPromise;
      const b = await store.getBranding();
      if (b) {
        const newBranding = {
          appName: b.appName || defaults.appName,
          subtitle: b.subtitle || defaults.subtitle,
          logoUrl: isValidLogoUrl(b.logoUrl) ? b.logoUrl : defaults.logoUrl,
          primaryColor: b.primaryColor || defaults.primaryColor,
          selfRegistration: b.selfRegistration !== false,
        };
        setBranding(newBranding);
        applyPrimaryColor(newBranding.primaryColor);
      }
    } catch { /* use defaults */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <BrandingContext.Provider value={{ ...branding, refresh: load }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
