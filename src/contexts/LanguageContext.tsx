import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { bn, type Lang } from "@/lib/i18n/dictionary";

const STORAGE_KEY = "wams_lang";

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Looks up `key` (the English string) in the Bangla dictionary when the
   *  language is set to Bangla — falls back to the English key itself when
   *  it's "en", or when a key has no Bangla entry yet, so wiring up a new
   *  page incrementally never shows a blank/broken label. */
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === "bn" ? "bn" : "en";
    } catch {
      return "en";
    }
  });

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage can be unavailable (private mode) — language choice
      // just won't persist across reloads, nothing else depends on it.
    }
  }, []);

  const t = useCallback((key: string) => (lang === "bn" ? bn[key] || key : key), [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
