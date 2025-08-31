'use client';
import { useEffect, useState } from 'react';
import { dict, Lang } from '../i18n';
export default function Hero(){
  const [lang,setLang]=useState<Lang>('en'); useEffect(()=>{const s=localStorage.getItem('lang') as Lang|null; if(s) setLang(s);},[]);
  const t=dict[lang];
  const [price,setPrice]=useState('--'); const [time,setTime]=useState('');
  useEffect(()=>{ const load=async()=>{ try{ const r=await fetch('/api/price',{cache:'no-store'}); const j=await r.json(); setPrice(j?.price==null?'--':j.price+' USD'); setTime(j?.time||''); }catch(e){} }; load(); const id=setInterval(load,30000); return()=>clearInterval(id); },[]);
  return(<section className="hero relative py-4"><div className="container grid gap-3">
    <div className="flex items-center justify-center py-2"><div className="ring"><img src="/assets/img/logo.jpeg" alt="ELTX logo"/></div></div>
    <div className="text-center"><h1 className="text-3xl md:text-5xl font-black bg-gradient-to-r from-[var(--brand1)] to-[var(--brand2)] text-transparent bg-clip-text">{t.hero_title}</h1>
    <p className="text-[var(--muted)] mt-1">{t.hero_sub}</p>
    <div className="flex gap-2 flex-wrap justify-center mt-2">
      <a className="btn btn-primary" href="#features">✨ {dict[lang].explore}</a>
      <a className="btn btn-ghost" href="#roadmap">🗺️ {dict[lang].roadmap}</a>
      <a className="btn btn-ghost" target="_blank" href="https://docs.google.com/document/d/1GvKvPaaUwEH7oVHFG7AnQsAlfQCr7yeM/mobilebasic">📄 Whitepaper</a>
    </div>
    <div className="flex gap-2 flex-wrap justify-center mt-2">
      <a className="btn btn-ghost" target="_blank" href="https://www.geckoterminal.com/solana/pools/9JotmGt6n9Yzyww327CfYHWEXRzMnjJT2wRYWMRaA6Jd?utm_source=coingecko&utm_medium=referral&utm_campaign=searchresults">GeckoTerminal</a>
      <a className="btn btn-ghost" target="_blank" href="https://x.com/ELTX_Official">X</a>
      <a className="btn btn-ghost" target="_blank" href="https://t.me/eltx_chat">Telegram</a>
    </div></div>
    <div className="panel p-3 max-w-md mx-auto"><div className="text-center text-xs text-[var(--muted)]">Current Price</div>
      <div className="text-center text-2xl font-black my-1">{price}</div>
      <div className="text-center text-xs text-[var(--muted)]">{time}</div></div>
  </div></section>);
}
