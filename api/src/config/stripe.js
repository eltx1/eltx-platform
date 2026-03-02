const Stripe = require('stripe');

const STRIPE_BASE_FALLBACK = 'https://lordai.net';

function normalizeSettingValue(value) {
  if (value === undefined || value === null) return null;
  const str = value.toString().trim();
  return str.length ? str : null;
}

function normalizeBaseUrl(value) {
  const normalized = normalizeSettingValue(value);
  if (!normalized) return null;
  return normalized.replace(/\/+$/, '');
}

function buildDefaultSuccessUrl(base) {
  const normalized = normalizeBaseUrl(base) || STRIPE_BASE_FALLBACK;
  return `${normalized}/wallet`;
}

function buildDefaultCancelUrl(base) {
  const normalized = normalizeBaseUrl(base) || STRIPE_BASE_FALLBACK;
  return `${normalized}/wallet`;
}

function parsePositiveNumberSetting(value, fallback) {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) return num;
  return fallback;
}

function parseOptionalPositiveNumber(value) {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) return num;
  return null;
}

const DEFAULT_STRIPE_RETURN_BASE =
  normalizeBaseUrl(process.env.APP_BASE_URL || process.env.STRIPE_RETURN_URL_BASE || STRIPE_BASE_FALLBACK) ||
  STRIPE_BASE_FALLBACK;

function createStripeState() {
  let stripeSecretKey = normalizeSettingValue(process.env.STRIPE_SECRET_KEY);
  let stripePublishableKey = normalizeSettingValue(
    process.env.STRIPE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  );
  let stripeWebhookSecret = normalizeSettingValue(process.env.STRIPE_WEBHOOK_SECRET);
  let stripeReturnBase = DEFAULT_STRIPE_RETURN_BASE;
  let stripeSuccessUrl = normalizeSettingValue(process.env.STRIPE_SUCCESS_URL) || buildDefaultSuccessUrl(stripeReturnBase);
  let stripeCancelUrl = normalizeSettingValue(process.env.STRIPE_CANCEL_URL) || buildDefaultCancelUrl(stripeReturnBase);
  let stripeMinPurchaseUsd = parsePositiveNumberSetting(process.env.STRIPE_MIN_PURCHASE_USD, 10);
  let stripeMaxPurchaseUsd = parseOptionalPositiveNumber(process.env.STRIPE_MAX_PURCHASE_USD);

  let stripe = null;
  let stripeInitError = null;

  function initializeStripeSdk() {
    stripe = null;
    stripeInitError = null;
    if (!stripeSecretKey) return;
    try {
      stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });
    } catch (err) {
      stripeInitError = err?.message || 'Unknown error';
      console.error('[stripe] init failed', err.message || err);
      stripe = null;
    }
  }

  function isStripeEnabled() {
    return !!stripe && !!stripePublishableKey;
  }

  function applyStripeConfig(partial) {
    let reinitialize = false;
    if (Object.prototype.hasOwnProperty.call(partial, 'secretKey')) {
      const normalized = normalizeSettingValue(partial.secretKey);
      if (normalized !== stripeSecretKey) {
        stripeSecretKey = normalized;
        reinitialize = true;
      }
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'publishableKey')) {
      stripePublishableKey = normalizeSettingValue(partial.publishableKey);
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'webhookSecret')) {
      stripeWebhookSecret = normalizeSettingValue(partial.webhookSecret);
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'returnBase')) {
      const normalizedBase = normalizeBaseUrl(partial.returnBase) || DEFAULT_STRIPE_RETURN_BASE;
      stripeReturnBase = normalizedBase;
      if (!Object.prototype.hasOwnProperty.call(partial, 'successUrl')) {
        stripeSuccessUrl = buildDefaultSuccessUrl(stripeReturnBase);
      }
      if (!Object.prototype.hasOwnProperty.call(partial, 'cancelUrl')) {
        stripeCancelUrl = buildDefaultCancelUrl(stripeReturnBase);
      }
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'successUrl')) {
      const normalizedSuccess = normalizeSettingValue(partial.successUrl);
      stripeSuccessUrl = normalizedSuccess || buildDefaultSuccessUrl(stripeReturnBase);
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'cancelUrl')) {
      const normalizedCancel = normalizeSettingValue(partial.cancelUrl);
      stripeCancelUrl = normalizedCancel || buildDefaultCancelUrl(stripeReturnBase);
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'minPurchaseUsd')) {
      stripeMinPurchaseUsd = parsePositiveNumberSetting(partial.minPurchaseUsd, stripeMinPurchaseUsd || 10);
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'maxPurchaseUsd')) {
      stripeMaxPurchaseUsd = parseOptionalPositiveNumber(partial.maxPurchaseUsd);
    }
    if (reinitialize) initializeStripeSdk();
  }

  function getStripeIssues() {
    const issues = [];
    if (!stripeSecretKey) issues.push('STRIPE_SECRET_KEY is not set');
    if (!stripePublishableKey) issues.push('STRIPE_PUBLISHABLE_KEY is not set');
    if (!stripeWebhookSecret) issues.push('STRIPE_WEBHOOK_SECRET is not set');
    if (stripeSecretKey && !stripe) {
      issues.push(stripeInitError ? `Stripe SDK failed to initialize (${stripeInitError})` : 'Stripe SDK is not initialized');
    }
    return issues;
  }

  function getStripeStatusPayload(audience = 'public') {
    const issues = getStripeIssues();
    const reason = issues.length ? issues.join('; ') : null;
    const base = {
      enabled: isStripeEnabled(),
      reason,
      publishableKey: stripePublishableKey,
    };
    if (audience === 'admin') {
      return {
        ...base,
        secretKey: stripeSecretKey,
        webhookSecret: stripeWebhookSecret,
        returnUrlBase: stripeReturnBase,
        successUrl: stripeSuccessUrl,
        cancelUrl: stripeCancelUrl,
        minPurchaseUsd: stripeMinPurchaseUsd,
        maxPurchaseUsd: stripeMaxPurchaseUsd,
        sdkReady: !!stripe,
      };
    }
    return base;
  }

  initializeStripeSdk();

  return {
    applyStripeConfig,
    getStripeStatusPayload,
    isStripeEnabled,
    get stripe() {
      return stripe;
    },
    get stripeWebhookSecret() {
      return stripeWebhookSecret;
    },
    get stripeSuccessUrl() {
      return stripeSuccessUrl;
    },
    get stripeCancelUrl() {
      return stripeCancelUrl;
    },
    get stripeMinPurchaseUsd() {
      return stripeMinPurchaseUsd;
    },
    get stripeMaxPurchaseUsd() {
      return stripeMaxPurchaseUsd;
    },
  };
}

module.exports = { createStripeState, STRIPE_BASE_FALLBACK };
