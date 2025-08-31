export default function Roadmap(){
  const Phase=({n,title,items}:{n:number,title:string,items:string[]})=>(<article className="relative panel p-3">
    <div className="inline-block bg-gradient-to-r from-[var(--brand1)] to-[var(--brand2)] text-[#2b1800] font-black rounded-full px-3 py-1 mb-2">Phase {n}</div>
    <h3 className="font-bold mb-1">{title}</h3><ul className="list-none pl-0 space-y-1">{items.map((it,i)=><li key={i}>{it}</li>)}</ul></article>);
  return(<section id="roadmap" className="py-4"><div className="container"><h2 className="text-lg font-bold mb-2">🗺️ Roadmap</h2>
    <div className="relative grid gap-3 md:grid-cols-4"><div className="hidden md:block absolute inset-y-0 left-0 right-0 mx-auto w-full h-0.5 bg-gradient-to-r from-[var(--brand1)] to-[var(--brand2)] opacity-60 pointer-events-none"/>
      <Phase n={1} title="Foundation" items={['✅ Responsive homepage','✅ Live price feed','🔄 API layer']}/>
      <Phase n={2} title="Accounts" items={['🔒 Auth & dashboard','💳 Custodial wallets','📊 Internal ledger']}/>
      <Phase n={3} title="AI & Markets" items={['🤖 AI assistant','🧱 Market MVP','🎁 Staking MVP']}/>
      <Phase n={4} title="Scale" items={['🌉 Multichain','📱 Mobile app','🏪 Partners']}/>
    </div></div></section>);
}