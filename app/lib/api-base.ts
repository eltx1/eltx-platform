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
  return configuredBase;
}
