export default function Features(){
  const Card=({icon,title,text,pills}:{icon:string,title:string,text:string,pills:string[]})=>(
    <article className="panel p-4 bg-gradient-to-br from-black/5 to-black/0">
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[var(--brand1)]/30 to-[var(--brand2)]/20 border border-[var(--line)] grid place-items-center text-2xl mb-2 shadow-lg">{icon}</div>
      <h3 className="font-bold">{title}</h3><p className="text-[var(--muted)] text-sm">{text}</p>
      <div className="flex flex-wrap gap-2 mt-2">{pills.map(p=><span key={p} className="px-3 py-1 rounded-full border border-[var(--line)] text-xs bg-black/5">{p}</span>)}</div>
    </article>);
  return(<section id="features" className="py-4"><div className="container"><h2 className="text-lg font-bold mb-2">⚡ Features</h2>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
      <Card icon="🤖" title="AI Assistant" text="Insights, alerts, and portfolio tips." pills={['Smart Alerts','Insights','Tips']}/>
      <Card icon="💹" title="Trade" text="Internal orderbook with low fees." pills={['Orderbook','Low Fees','Fast']}/>
      <Card icon="📈" title="Staking" text="Flexible pools and rewards." pills={['Flexible','APY','Rewards']}/>
      <Card icon="🎮" title="Play to Earn" text="Quests and mini games to earn rewards." pills={['Quests','Mini Games','Perks']}/>
    </div></div></section>);
}
