import Hero from '../components/home/Hero';
import Industries from '../components/home/Industries';
import Features from '../components/home/Features';
import Tokenomics from '../components/home/Tokenomics';
import Roadmap from '../components/home/Roadmap';
import About from '../components/home/About';
import EthereumToken from '../components/home/EthereumToken';
import Partners from '../components/home/Partners';
import UserTrust from '../components/home/UserTrust';
import MarketSpotlight from '../components/home/MarketSpotlight';
import SeoIntro from '../components/home/SeoIntro';
import { getHomeOverview } from './lib/home-data';
import ScrollToTopOnLoad from '../components/ScrollToTopOnLoad';


export default async function Page() {
  const overview = await getHomeOverview();
  return (
    <main className="flex flex-col">
      <ScrollToTopOnLoad />
      <Hero />
      <UserTrust userCount={overview.userCount} />
      <About />
      <SeoIntro />
      <MarketSpotlight markets={overview.markets} />
      <Industries />
      <Features />
      <EthereumToken />
      <Tokenomics />
      <Roadmap />
      <Partners />

    </main>
  );
}
