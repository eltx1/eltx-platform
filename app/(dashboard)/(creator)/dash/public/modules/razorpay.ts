const disabledMessage =
  'Razorpay integration has been retired from the creator dashboard. Card payments now flow through Stripe. ' +
  'Any legacy Razorpay helpers should be considered disabled.';

type DisabledCallable = ((...args: never[]) => never) & {
  enabled: false;
  isEnabled: () => false;
  [key: string]: DisabledCallable | boolean | (() => false) | undefined;
};

const disabledCallable: DisabledCallable = new Proxy(
  (() => {
    throw new Error(disabledMessage);
  }) as DisabledCallable,
  {
    get: (_target, prop) => {
      if (prop === 'enabled') return false;
      if (prop === 'isEnabled') return () => false;
      if (prop === 'then') return undefined;
      return disabledCallable;
    },
    apply: () => {
      throw new Error(disabledMessage);
    },
  }
) as DisabledCallable;

export type LegacyRazorpayShim = DisabledCallable;

const shim: LegacyRazorpayShim = disabledCallable;

export const Razorpay: LegacyRazorpayShim = shim;
export const disabledRazorpay: LegacyRazorpayShim = shim;
export const createOrder: LegacyRazorpayShim = shim;
export const createCheckout: LegacyRazorpayShim = shim;
export const createCheckoutSession: LegacyRazorpayShim = shim;
export const createLessonCheckout: LegacyRazorpayShim = shim;
export const loadScript: LegacyRazorpayShim = shim;
export const ensureInitialized: LegacyRazorpayShim = shim;
export const ensureClient: LegacyRazorpayShim = shim;
export const fetchPlans: LegacyRazorpayShim = shim;
export const fetchPricing: LegacyRazorpayShim = shim;
export const resolvePricing: LegacyRazorpayShim = shim;
export const verifySignature: LegacyRazorpayShim = shim;
export const cancelOrder: LegacyRazorpayShim = shim;
export const openCheckout: LegacyRazorpayShim = shim;
export const toCheckoutPayload: LegacyRazorpayShim = shim;
export const parseCheckoutResponse: LegacyRazorpayShim = shim;
export const isEnabled = () => false;
export const enabled = false;

export default shim;
