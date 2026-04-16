import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import * as store from '@/services/dataStore';

interface BrandingState {
  appName: string;
  subtitle: string;
  logoUrl: string;
  primaryColor: string;
}

interface BrandingContextType extends BrandingState {
  refresh: () => Promise<void>;
}

const defaults: BrandingState = {
  appName: 'RBAC Access',
  subtitle: 'Tillträdeshantering',
  logoUrl: '',
  primaryColor: '#2563eb',
};

const BrandingContext = createContext<BrandingContextType>({ ...defaults, refresh: async () => {} });

function hexToHsl(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
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

function applyPrimaryColor(hex: string) {
  const hsl = hexToHsl(hex);
  if (!hsl) return;
  document.documentElement.style.setProperty('--primary', hsl);
  // Compute a lighter foreground for contrast on the primary bg
  const parts = hsl.split(' ');
  const lightness = parseInt(parts[2]);
  const fgL = lightness > 50 ? '10%' : '98%';
  document.documentElement.style.setProperty('--primary-foreground', `${parts[0]} ${parts[1]} ${fgL}`);
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingState>(defaults);

  const load = useCallback(async () => {
    try {
      await store.initPromise;
      const s = await store.getSettings();
      if (s.branding) {
        const newBranding = {
          appName: s.branding.appName || defaults.appName,
          subtitle: s.branding.subtitle || defaults.subtitle,
          logoUrl: s.branding.logoUrl || defaults.logoUrl,
          primaryColor: s.branding.primaryColor || defaults.primaryColor,
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
