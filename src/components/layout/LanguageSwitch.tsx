import { getLanguage, setLanguage, type Language } from '@/i18n';

const OPTIONS: { value: Language; label: string }[] = [
  { value: 'sv', label: 'Svenska' },
  { value: 'en', label: 'English' },
];

/** "Svenska | English" for pages without a signed-in user (saved in the browser). */
export function LanguageSwitch({ className = '' }: { className?: string }) {
  const current = getLanguage();
  return (
    <div className={`flex items-center justify-center gap-1 text-xs ${className}`} role="group" aria-label="Språk / Language">
      {OPTIONS.map((o, i) => (
        <span key={o.value} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground" aria-hidden="true">|</span>}
          <button
            type="button"
            lang={o.value}
            onClick={() => setLanguage(o.value)}
            aria-pressed={current === o.value}
            className={current === o.value ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground hover:underline'}
          >
            {o.label}
          </button>
        </span>
      ))}
    </div>
  );
}
