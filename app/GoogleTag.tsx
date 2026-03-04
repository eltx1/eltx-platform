import { getGoogleTagSettings } from './lib/analytics.server';

export default async function GoogleTag() {
  const settings = await getGoogleTagSettings();
  if (!settings.enabled || !settings.measurementId) return null;

  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(settings.measurementId)}`} />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${settings.measurementId}');`,
        }}
      />
      {settings.customHeadScript ? <script dangerouslySetInnerHTML={{ __html: settings.customHeadScript }} /> : null}
    </>
  );
}
