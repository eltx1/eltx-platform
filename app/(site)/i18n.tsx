"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'ar';

export const dict = {
  en: {
    site_title: 'ELTX',
    hero_title: 'ELTX — Community‑Driven Utility Token',
    hero_sub: 'Fast, secure, rewarding. Built mobile‑first.',
    explore: 'Explore',
    roadmap: 'View Roadmap',
    whitepaper: 'Whitepaper',
    features: 'Features',
    tokenomics: 'Tokenomics',
    roadmap_title: 'Roadmap',
    community: 'Community',
    login: 'Login',
    signup: 'Sign Up'
  },
  ar: {
    site_title: 'ELTX',
    hero_title: 'ELTX — توكن منفعي يقوده المجتمع',
    hero_sub: 'سريع وآمن ومجزٍ. مصمّم للموبايل أولًا.',
    explore: 'استكشف',
    roadmap: 'الخريطة',
    whitepaper: 'الورقة البيضاء',
    features: 'الميزات',
    tokenomics: 'التوكنوميكس',
    roadmap_title: 'خريطة الطريق',
    community: 'المجتمع',
    login: 'تسجيل الدخول',
    signup: 'إنشاء حساب'
  }
} as const;

type LangContextShape = { lang: Lang; setLang: (l: Lang) => void };
const LangContext = createContext<LangContextShape>({ lang: 'en', setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en');

  useEffect(() => {
    const stored = localStorage.getItem('lang') as Lang | null;
    if (stored) setLang(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('lang', lang);
  }, [lang]);

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
