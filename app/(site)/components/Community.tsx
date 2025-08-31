export default function Community(){
  return(<section id="community" className="py-4"><div className="container"><h2 className="text-lg font-bold mb-2">🤝 Community & Links</h2>
    <p className="text-[var(--muted)] text-sm">Join the community and follow updates.</p>
    <h3 className="text-sm text-[var(--muted)] mt-2">Partners</h3>
    <div className="flex flex-wrap gap-2 mt-1">{['A','B','C','D'].map(x=><span key={x} className="w-12 h-12 rounded-xl border border-white/15 bg-white/5 grid place-items-center font-black">{x}</span>)}</div>
    <div className="flex flex-wrap gap-2 mt-3">
      <a className="btn btn-primary" target="_blank" href="https://t.me/eltx_official">Telegram Channel</a>
      <a className="btn btn-primary" target="_blank" href="https://t.me/eltx_chat">Telegram Chat</a>
      <a className="btn btn-primary" target="_blank" href="https://x.com/ELTX_Official">X (Twitter)</a>
    </div></div></section>);
}