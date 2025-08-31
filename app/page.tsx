import Ticker from './(site)/components/Ticker';
import Header from './(site)/components/Header';
import Hero from './(site)/components/Hero';
import Features from './(site)/components/Features';
import Tokenomics from './(site)/components/Tokenomics';
import Roadmap from './(site)/components/Roadmap';
import Community from './(site)/components/Community';
import BottomNav from './(site)/components/BottomNav';

export default function Page(){
  return(<main>
    <Ticker/><Header/><Hero/><Features/><Tokenomics/><Roadmap/><Community/><BottomNav/>
    <footer className="container py-4 text-[var(--muted)] text-sm border-t border-[var(--line)] mt-4 flex items-center justify-between">
      <div>© {new Date().getFullYear()} ELTX</div>
      <div className="flex gap-2"><a href="#">Privacy</a><span>·</span><a href="#">Terms</a></div>
    </footer>
  </main>);
}
