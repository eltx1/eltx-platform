import { redirect } from 'next/navigation';

const WHITEPAPER_URL =
  'https://docs.google.com/document/d/1GvKvPaaUwEH7oVHFG7AnQsAlfQCr7yeM/edit?usp=sharing&ouid=105525474968747453793&rtpof=true&sd=true';

export default function DocsPage() {
  redirect(WHITEPAPER_URL);
}
