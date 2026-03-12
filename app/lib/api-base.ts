'use client';

function normalizeBase(base: string | undefined) {
  if (!base) return '';
  return base.replace(/\/+$/, '');
}

function parseOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

export function getConfiguredApiBase() {
  return normalizeBase(process.env.NEXT_PUBLIC_API_BASE);
}


export function getConfiguredApiOriginForBrowser() {
  const configuredBase = getConfiguredApiBase();
  if (!configuredBase) {
    if (typeof window === 'undefined') return '';
    return window.location.origin;
  }
  const configuredOrigin = parseOrigin(configuredBase);
  return configuredOrigin || configuredBase;
}

export function getApiBaseForBrowser() {
  const configuredBase = getConfiguredApiBase();
  if (typeof window === 'undefined') return configuredBase;
  if (!configuredBase) return window.location.origin;

  const configuredOrigin = parseOrigin(configuredBase);
  const currentOrigin = window.location.origin;

  if (!configuredOrigin) return configuredBase;
  if (configuredOrigin === currentOrigin) return configuredBase;

  try {
    const configuredUrl = new URL(configuredOrigin);
    const currentUrl = new URL(currentOrigin);
    const apexHost = configuredUrl.hostname.startsWith('api.') ? configuredUrl.hostname.slice(4) : '';
    const isSameApex = apexHost && currentUrl.hostname === apexHost;

    if (isSameApex && configuredUrl.protocol === currentUrl.protocol) {
      return currentOrigin;
    }
  } catch {
    return configuredBase;
  }

  return configuredBase;
}

