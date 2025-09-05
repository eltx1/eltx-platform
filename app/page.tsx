import Hero from '../components/home/Hero';
import Industries from '../components/home/Industries';
import Features from '../components/home/Features';
import Tokenomics from '../components/home/Tokenomics';
import Roadmap from '../components/home/Roadmap';

export default function Page(){
  return(
    <main className="space-y-24">
      <Hero />
      <Industries />
      <Features />
      <Tokenomics />
      <Roadmap />
    </main>
  );
}
