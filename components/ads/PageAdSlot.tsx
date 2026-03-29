'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { type PageAdPlacement } from '../../app/lib/page-ads';
import { useLang } from '../../app/lib/i18n';

type PageAdsResponse = {
  html?: string;
};

const DEFAULT_HEIGHT = 120;

export default function PageAdSlot({ placement, className = '' }: { placement: PageAdPlacement; className?: string }) {
  const { lang } = useLang();
  const [html, setHtml] = useState('');
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadAd = async () => {
      try {
        const res = await fetch(`/api/page-ads?placement=${placement}`, { cache: 'no-store' });
        const data = (await res.json()) as PageAdsResponse;
        if (!cancelled) {
          setHtml(typeof data?.html === 'string' ? data.html : '');
        }
      } catch {
        if (!cancelled) setHtml('');
      }
    };

    loadAd();
    return () => {
      cancelled = true;
    };
  }, [placement]);

  useEffect(() => {
    const listener = (event: MessageEvent<{ type?: string; height?: number }>) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      if (event.data?.type !== 'page-ad-resize') return;
      const nextHeight = Number(event.data.height || 0);
      if (!Number.isFinite(nextHeight) || nextHeight <= 0) return;
      setHeight(Math.max(DEFAULT_HEIGHT, Math.min(1200, nextHeight + 8)));
    };

    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  const srcDoc = useMemo(() => {
    if (!html.trim()) return '';
    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>html,body{margin:0;padding:0;background:transparent;overflow:hidden;max-width:100%;}*{box-sizing:border-box;max-width:100%;}</style>
  </head>
  <body>
    ${html}
    <script>
      const sendHeight = () => {
        const h = Math.max(document.body.scrollHeight || 0, document.documentElement.scrollHeight || 0);
        window.parent.postMessage({ type: 'page-ad-resize', height: h }, '*');
      };
      sendHeight();
      new ResizeObserver(sendHeight).observe(document.body);
      window.addEventListener('load', sendHeight);
      setTimeout(sendHeight, 250);
      setTimeout(sendHeight, 1000);
    </script>
  </body>
</html>`;
  }, [html]);

  if (!html.trim() || !srcDoc) return null;

  return (
    <section className={`x-card space-y-2 p-3 ${className}`.trim()}>
      <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">{lang === 'ar' ? 'إعلان' : 'Sponsored'}</p>
      <iframe
        ref={iframeRef}
        title={`ad-${placement}`}
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"
        className="w-full rounded-lg border-0 bg-transparent"
        style={{ height }}
      />
    </section>
  );
}
