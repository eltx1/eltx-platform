# Stripe webhook setup for ELTX purchases

The API exposes a single webhook endpoint for Stripe events:

- **Endpoint URL:** `https://api.eltx.online/stripe/webhook` (replace the domain with your **API** host, not the public frontend; there is no extra path beyond `/stripe/webhook`).
- The handler requires the raw request body and validates the `Stripe-Signature` header using the configured signing secret.
- Supported events include `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, and `charge.refund.updated`.

## Configuration steps
1. In the Stripe Dashboard, go to **Developers → Webhooks** and add a new endpoint.
2. Set the **Endpoint URL** to the full path `https://api.eltx.online/stripe/webhook` (or whatever value you use for `NEXT_PUBLIC_API_BASE`, ending with `/stripe/webhook`).
3. Select the events listed above (at minimum `checkout.session.completed`).
4. Copy the **Signing secret** from Stripe and set it as `STRIPE_WEBHOOK_SECRET` in the environment (or in the `platform_settings` table under `stripe_webhook_secret`).
5. Restart the API so it reloads the updated secret and initializes Stripe.
6. Use the Stripe “Send test webhook” button with `checkout.session.completed`; a `200` with `{ "received": true }` confirms the endpoint is reachable and the signature is valid.

## What happens after updating the webhook
- When a valid `checkout.session.completed` event is received, the server updates the corresponding purchase record and credits the user. Until that webhook arrives, the purchase remains pending and the frontend shows a “Waiting for confirmation…” message.
- If you fix the webhook configuration **after** a live checkout already succeeded, Stripe will not re-send past events automatically. Use the Stripe Dashboard to **Resend** the relevant event or perform a new test/live checkout to trigger a fresh event with the correct signature.

## Default return URLs (for reference)
- Success: `https://eltx.online/buy?status=success&session_id={CHECKOUT_SESSION_ID}`
- Cancel: `https://eltx.online/buy?status=cancelled`
- You can override them with environment variables `STRIPE_SUCCESS_URL` and `STRIPE_CANCEL_URL`, or change the base with `APP_BASE_URL`/`STRIPE_RETURN_URL_BASE`.
