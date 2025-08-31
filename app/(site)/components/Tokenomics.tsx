'use client';
const TOKENS=[
  {k:'Team',p:15,c:'#ff5a3c'},{k:'Investment',p:10,c:'#ffc34d'},{k:'Community',p:25,c:'#9b87f5'},
  {k:'Staking',p:15,c:'#f25ba3'},{k:'Liquidity',p:10,c:'#f59e0b'},{k:'Development',p:10,c:'#34d399'},
  {k:'Marketing',p:10,c:'#38bdf8'},{k:'Reserve',p:5,c:'#ef4444'},
];
export default function Tokenomics(){
  const gradient=(()=>{let acc=0;return 'conic-gradient('+TOKENS.map(t=>{const from=acc;const to=acc+t.p;acc=to;return `${t.c} ${from}% ${to}%`;}).join(', ')+')';})();
  return(<section id="tokenomics" className="py-4"><div className="container panel p-3"><h2 className="text-lg font-bold mb-2">💠 Tokenomics</h2>
    <div className="grid gap-3 md:grid-cols-[260px_1fr] items-center">
      <div className="donut" style={{['--donut' as any]:gradient} as any}><div className="hole"><div className="font-black">ELTX</div><div className="text-xs text-[var(--muted)]">Total 1B</div></div></div>
      <ul className="grid gap-2">{TOKENS.map(t=>(<li key={t.k} className="grid items-center gap-2" style={{gridTemplateColumns:'16px 1fr 1fr auto'}}>
        <span className="w-2.5 h-2.5 rounded-full" style={{background:t.c}}/><b>{t.k}</b>
        <span className="h-2 bg-black/10 rounded-full overflow-hidden"><i className="block h-full" style={{width:`${t.p}%`,background:t.c}}/></span>
        <span className="font-black">{t.p}%</span></li>))}</ul>
    </div></div></section>);
}