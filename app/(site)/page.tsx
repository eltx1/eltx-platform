import Ticker from './components/Ticker';
import Hero from './components/Hero';
import Audience from './components/Audience';
import Features from './components/Features';
import Tokenomics from './components/Tokenomics';
import Roadmap from './components/Roadmap';
import Community from './components/Community';
import BottomNav from './components/BottomNav';

export default function Page(){
  return(
    <main>
      <Ticker />
      <Hero />
      <Audience />
      <Features />
      <Tokenomics />
      <Roadmap />
      <Community />
      <BottomNav />
    </main>
  );
}
