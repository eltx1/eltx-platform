import { getGoogleTagSettings } from './lib/analytics.server';

export default async function GoogleTag() {
  const settings = await getGoogleTagSettings();
  if (!settings.enabled || !settings.measurementId) return null;

  const runtimeSettings = JSON.stringify({
    enabled: settings.enabled,
    measurementId: settings.measurementId,
    consentModeEnabled: settings.consentModeEnabled,
    eventCatalog: settings.eventCatalog,
    adsConversion: settings.adsConversion,
  });

  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(settings.measurementId)}`} />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
window.__analyticsSettings = ${runtimeSettings};
gtag('js', new Date());
${
  settings.consentModeEnabled
    ? "gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' });"
    : ''
}
gtag('config', '${settings.measurementId}');`,
        }}
      />
      {settings.customHeadScript ? <script dangerouslySetInnerHTML={{ __html: settings.customHeadScript }} /> : null}
    </>
  );
}
