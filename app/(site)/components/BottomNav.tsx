export default function BottomNav(){
  const Item=({href,emoji,label}:{href:string,emoji:string,label:string})=>(<a href={href} className="flex flex-col items-center gap-1 no-underline"><span>{emoji}</span><small className="text-xs">{label}</small></a>);
  return(<nav className="bottom-nav"><Item href="#" emoji="🏠" label="Home"/><Item href="#features" emoji="✨" label="Features"/><Item href="#tokenomics" emoji="💠" label="Tokenomics"/><Item href="#roadmap" emoji="🗺️" label="Roadmap"/><Item href="#community" emoji="💬" label="Community"/></nav>);
}