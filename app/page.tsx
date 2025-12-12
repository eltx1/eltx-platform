import Hero from '../components/home/Hero';
import Industries from '../components/home/Industries';
import Features from '../components/home/Features';
import Tokenomics from '../components/home/Tokenomics';
import Roadmap from '../components/home/Roadmap';
import About from '../components/home/About';
import EthereumToken from '../components/home/EthereumToken';
import Swap from '../components/home/Swap';
import Partners from '../components/home/Partners';
import UserTrust from '../components/home/UserTrust';
import MarketSpotlight from '../components/home/MarketSpotlight';
import AppDownloadBar from '../components/home/AppDownloadBar';
import { getHomeOverview } from './lib/home-data';


export default async function Page(){
  const overview = await getHomeOverview();
  return(
    <main className="flex flex-col">
      <Hero />
      <UserTrust userCount={overview.userCount} />
      <About />
      <MarketSpotlight markets={overview.markets} />
      <Industries />
      <Features />
      <EthereumToken />
      <Swap />
      <Tokenomics />
      <Roadmap />
      <Partners />
      <AppDownloadBar />

    </main>
  );
}
