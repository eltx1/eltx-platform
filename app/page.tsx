import Hero from '../components/home/Hero';
import Industries from '../components/home/Industries';
import Features from '../components/home/Features';
import Tokenomics from '../components/home/Tokenomics';
import Roadmap from '../components/home/Roadmap';
import About from '../components/home/About';
import EthereumToken from '../components/home/EthereumToken';
import Swap from '../components/home/Swap';
import Partners from '../components/home/Partners';


export default function Page(){
  return(
    <main className="flex flex-col">
      <Hero />
      <About />
      <Industries />
      <Features />
      <EthereumToken />
      <Swap />
      <Tokenomics />
      <Roadmap />
      <Partners />

    </main>
  );
}
