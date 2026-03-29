'use client';

import { useEffect } from 'react';
import { type PageAdPlacement } from '../../app/lib/page-ads';

type PageAdsResponse = {
  html?: string;
};

function activateScripts(root: HTMLElement) {
  const scripts = Array.from(root.querySelectorAll('script'));
  for (const script of scripts) {
    const replacement = document.createElement('script');
    for (const attr of Array.from(script.attributes)) {
      replacement.setAttribute(attr.name, attr.value);
    }
    replacement.text = script.text;
    script.parentNode?.replaceChild(replacement, script);
  }
}

export default function PageAdInject({ placement }: { placement: PageAdPlacement }) {
  useEffect(() => {
    let cancelled = false;
    let host: HTMLDivElement | null = null;

    const loadAd = async () => {
      try {
        const res = await fetch(`/api/page-ads?placement=${placement}&kind=inject`, { cache: 'no-store' });
        const data = (await res.json()) as PageAdsResponse;
        const html = typeof data?.html === 'string' ? data.html.trim() : '';
        if (cancelled || !html) return;

        host = document.createElement('div');
        host.setAttribute('data-page-ad-inject', placement);
        host.style.display = 'contents';
        host.innerHTML = html;
        document.body.appendChild(host);
        activateScripts(host);
      } catch {
        // Ignore ad-inject network errors on client.
      }
    };

    loadAd();

    return () => {
      cancelled = true;
      if (host?.parentNode) {
        host.parentNode.removeChild(host);
      }
    };
  }, [placement]);

  return null;
}
