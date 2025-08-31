'use client';
import { useEffect, useState } from 'react';
import { dict, Lang } from '../i18n';
export default function Header(){
  const [lang, setLang] = useState<Lang>('en');
  useEffect(()=>{ const s = localStorage.getItem('lang') as Lang|null; if(s) setLang(s); },[]);
  useEffect(()=>{ document.documentElement.lang=lang; document.documentElement.dir=(lang==='ar')?'rtl':'ltr'; localStorage.setItem('lang',lang); },[lang]);
  const t = dict[lang];
  const [open,setOpen]=useState(false);
  return(<header className="header"><div className="container flex items-center justify-between py-2">
    <a href="#" className="flex items-center gap-2 no-underline">
      <span className="block w-11 h-11 rounded-xl overflow-hidden border border-white/15"><img src="/assets/img/logo.jpeg" alt="ELTX" /></span>
      <span className="font-black tracking-wide">{t.site_title}</span>
    </a>
    <button className="nav-toggle" onClick={()=>setOpen(v=>!v)}>☰</button>
    <nav className={`nav ${open?'open':''}`}>
      <a href="#features">{t.features}</a>
      <a href="#tokenomics">{t.tokenomics}</a>
      <a href="#roadmap">{t.roadmap_title}</a>
      <a href="#community">{t.community}</a>
      <button className="nav-toggle" onClick={()=>setLang(lang==='en'?'ar':'en')}>{lang==='en'?'العربية':'English'}</button>
    </nav>
  </div></header>);
}
