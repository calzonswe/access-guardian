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

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingState>(defaults);

  const load = useCallback(async () => {
    try {
      await store.initPromise;
      const s = await store.getSettings();
      if (s.branding) {
        setBranding({
          appName: s.branding.appName || defaults.appName,
          subtitle: s.branding.subtitle || defaults.subtitle,
          logoUrl: s.branding.logoUrl || defaults.logoUrl,
          primaryColor: s.branding.primaryColor || defaults.primaryColor,
        });
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
