'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type Lang = 'en' | 'ar';

export const dict = {
  en: {
    site_title: 'ELTX',
    hero_title: 'Welcome to ELTX',
    hero_sub: 'Fast and secure transactions.',
    auth: {
      signup: {
        title: 'Sign Up',
        success: 'Account created successfully. Please sign in.',
        exists: 'Email or username already exists.',
        genericError: 'Something went wrong. Please try again.',
        ready: 'Your account is ready. Sign in now.',
      },
      login: {
        title: 'Login',
        success: 'Welcome back!',
        invalid: 'Invalid email/username or password.',
        genericError: 'Something went wrong. Please try again.',
      },
    },
    dashboard: {
      title: 'Dashboard',
      cards: {
        wallet: { title: 'Wallet', subtitle: 'Deposit BNB, view address' },
        transactions: { title: 'Transactions', subtitle: 'Recent deposits' },
        faq: { title: 'FAQ', subtitle: '' },
        settings: { title: 'Settings', subtitle: '' },
        partners: { title: 'Partners', subtitle: '' },
      },
    },
    wallet: {
      title: 'Wallet',
      chainLabel: 'BNB Smart Chain (BSC) — Mainnet (56)',
      addressLabel: 'Deposit Address',
      copy: 'Copy',
      copied: 'Copied',
      qr: 'QR Code',
      transactions: 'Transactions',
      table: {
        time: 'Time',
        hash: 'Tx Hash',
        amount: 'Amount',
        confirms: 'Confirmations',
        status: {
          pending: 'Pending',
          confirmed: 'Confirmed',
          orphaned: 'Orphaned',
        },
      },
    },
    transactions: {
      title: 'Transactions',
      filter: {
        all: 'All',
        pending: 'Pending',
        confirmed: 'Confirmed',
      },
    },
    pay: {
      title: 'Pay',
      to: 'Recipient User ID',
      asset: 'Asset',
      amount: 'Amount',
      send: 'Send',
      balance: 'Balance',
      insufficient: 'Insufficient balance',
      success: 'Transfer complete',
    },
    nav: {
      home: 'Home',
      faq: 'FAQ',
      login: 'Sign In',
      signup: 'Sign Up',
      dashboard: 'Dashboard',
      earn: 'Earn',
      wallet: 'Wallet',
      transactions: 'Transactions',
      settings: 'Settings',
      logout: 'Logout',
      language: 'Language',
    },
    footer: {
      about: 'About',
      docs: 'Docs',
      terms: 'Terms',
      privacy: 'Privacy',
      status: 'Status',
      contact: 'Contact',
      tagline: 'The utility token platform.',
    },
    pages: {
      about: 'ELTX is a utility token platform.',
      docs: 'Documentation coming soon.',
      terms: 'Terms of service placeholder.',
      privacy: 'Privacy policy placeholder.',
      status: 'All systems operational.',
    },
    contact: {
      email: 'Email',
      message: 'Message',
      send: 'Send',
      success: 'Message sent!',
    },
    audience: {
      title: 'Who we serve',
      governments: {
        title: 'Governments',
        desc: 'Secure infrastructure for public services.',
      },
      companies: {
        title: 'Companies',
        desc: 'Tools for enterprises and startups.',
      },
      individuals: {
        title: 'Individuals',
        desc: 'Simple payments for everyone.',
      },
    },
    common: {
      soon: 'Soon',
      genericError: 'Something went wrong. Please try again.',
      copy: 'Copy',
      copied: 'Copied',
      userId: 'User ID',
    },
    errors: {
      userExists: 'Email or username already exists.',
      invalid: 'Invalid email/username or password.',
      generic: 'Something went wrong. Please try again.',
    },
  },
  ar: {
    site_title: 'ELTX',
    hero_title: 'مرحبًا بك في ELTX',
    hero_sub: 'معاملات سريعة وآمنة.',
    auth: {
      signup: {
        title: 'إنشاء حساب',
        success: 'تم إنشاء الحساب بنجاح. برجاء تسجيل الدخول.',
        exists: 'البريد الإلكتروني أو اسم المستخدم موجود بالفعل.',
        genericError: 'حدث خطأ. برجاء المحاولة مرة أخرى.',
        ready: 'تم تجهيز حسابك. سجّل الدخول الآن.',
      },
      login: {
        title: 'تسجيل الدخول',
        success: 'مرحبًا بعودتك!',
        invalid: 'البريد الإلكتروني/اسم المستخدم أو كلمة المرور غير صحيحة.',
        genericError: 'حدث خطأ. برجاء المحاولة مرة أخرى.',
      },
    },
    dashboard: {
      title: 'لوحة التحكم',
      cards: {
        wallet: { title: 'المحفظة', subtitle: 'إيداع BNB، عرض العنوان' },
        transactions: { title: 'الإيداعات', subtitle: 'آخر الإيداعات' },
        faq: { title: 'الأسئلة الشائعة', subtitle: '' },
        settings: { title: 'الإعدادات', subtitle: '' },
        partners: { title: 'الشركاء', subtitle: '' },
      },
    },
    wallet: {
      title: 'المحفظة',
      chainLabel: 'سلسلة بينانس الذكية (BSC) — الشبكة الرئيسية (56)',
      addressLabel: 'عنوان الإيداع',
      copy: 'نسخ',
      copied: 'تم النسخ',
      qr: 'رمز QR',
      transactions: 'المعاملات',
      table: {
        time: 'الوقت',
        hash: 'معرّف المعاملة',
        amount: 'المبلغ',
        confirms: 'التأكيدات',
        status: {
          pending: 'معلق',
          confirmed: 'مؤكد',
          orphaned: 'ملغى',
        },
      },
    },
    transactions: {
      title: 'الإيداعات',
      filter: {
        all: 'الكل',
        pending: 'معلق',
        confirmed: 'مؤكد',
      },
    },
    pay: {
      title: 'الدفع',
      to: 'معرّف المستخدم للمستلم',
      asset: 'الأصل',
      amount: 'الكمية',
      send: 'إرسال',
      balance: 'الرصيد',
      insufficient: 'الرصيد غير كافٍ',
      success: 'تم التحويل',
    },
    nav: {
      home: 'الرئيسية',
      faq: 'الأسئلة الشائعة',
      login: 'تسجيل الدخول',
      signup: 'إنشاء حساب',
      dashboard: 'لوحة التحكم',
      earn: 'اربح',
      wallet: 'المحفظة',
      transactions: 'الإيداعات',
      settings: 'الإعدادات',
      logout: 'تسجيل الخروج',
      language: 'اللغة',
    },
    footer: {
      about: 'حول',
      docs: 'المستندات',
      terms: 'الشروط',
      privacy: 'الخصوصية',
      status: 'الحالة',
      contact: 'اتصل بنا',
      tagline: 'منصة التوكنات الخدمية.',
    },
    pages: {
      about: 'ELTX هي منصة للتوكنات الخدمية.',
      docs: 'التوثيق قادم قريبًا.',
      terms: 'نموذج شروط الخدمة.',
      privacy: 'نموذج سياسة الخصوصية.',
      status: 'جميع الأنظمة تعمل.',
    },
    contact: {
      email: 'البريد الإلكتروني',
      message: 'الرسالة',
      send: 'إرسال',
      success: 'تم إرسال الرسالة!',
    },
    audience: {
      title: 'الفئات المستهدفة',
      governments: {
        title: 'الحكومات',
        desc: 'بنية آمنة للخدمات العامة.',
      },
      companies: {
        title: 'الشركات',
        desc: 'أدوات للمؤسسات والشركات الناشئة.',
      },
      individuals: {
        title: 'الأفراد',
        desc: 'مدفوعات سهلة للجميع.',
      },
    },
    common: {
      soon: 'قريبًا',
      genericError: 'حدث خطأ. برجاء المحاولة مرة أخرى.',
      copy: 'نسخ',
      copied: 'تم النسخ',
      userId: 'معرّف المستخدم',
    },
    errors: {
      userExists: 'البريد الإلكتروني أو اسم المستخدم موجود بالفعل.',
      invalid: 'بيانات الدخول غير صحيحة.',
      generic: 'حدث خطأ. برجاء المحاولة مرة أخرى.',
    },
  },
} as const;

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'en', setLang: () => {} });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>('en');
  useEffect(() => {
    const stored = (typeof window !== 'undefined' && localStorage.getItem('lang')) as Lang | null;
    if (stored) setLang(stored);
  }, []);
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    }
    if (typeof window !== 'undefined') localStorage.setItem('lang', lang);
  }, [lang]);
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
