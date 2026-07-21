import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import Stripe from "stripe";
import { subscriptionPatchFromStripe } from "./billingCore";
import type { StripeSubscriptionLike } from "./billingCore";

// Convex HTTP endpoints (served on the deployment's .convex.site host).

const http = httpRouter();

// Plaid webhook — low-latency trigger for transaction syncing. Configured as the
// `webhook` URL in plaid.createLinkToken. The cron (crons.ts) is the baseline;
// this just makes syncs prompt.
//
// SECURITY (fast-follow): verify the `Plaid-Verification` JWT
// (POST /webhook_verification_key/get → ES256 verify + request_body_sha256).
// Until then the endpoint only *triggers a sync* for a given item_id — it never
// returns data to the caller — so the worst case is an unauthenticated sync
// trigger (bounded), not a data leak.
http.route({
  path: "/plaid/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return new Response("bad request", { status: 400 });
    }

    // Log the full payload so we can see exactly what Plaid sends (convex logs).
    console.log("[plaid webhook]", JSON.stringify(body));

    const type = body?.webhook_type;
    const code = body?.webhook_code;
    const itemId = body?.item_id ? String(body.item_id) : null;
    if (!itemId) return new Response("ok", { status: 200 });

    if (type === "TRANSACTIONS") {
      // Only SYNC_UPDATES_AVAILABLE — Plaid also sends the legacy
      // INITIAL/HISTORICAL/DEFAULT_UPDATE codes for the same event, and
      // scheduling on all of them ran 3 concurrent syncs of one item (seen in
      // prod logs). /transactions/sync consumers only need this one code; the
      // first sync after connect is scheduled by exchangePublicToken.
      if (code === "SYNC_UPDATES_AVAILABLE") {
        await ctx.scheduler.runAfter(0, internal.plaid.syncItem, { itemId });
      }
    } else if (type === "ITEM") {
      if (code === "ERROR" || code === "USER_PERMISSION_REVOKED") {
        await ctx.runMutation(internal.plaid.setItemStatus, {
          itemId,
          status: "error",
        });
      } else if (code === "PENDING_EXPIRATION" || code === "LOGIN_REPAIRED") {
        await ctx.runMutation(internal.plaid.setItemStatus, {
          itemId,
          status: code === "LOGIN_REPAIRED" ? "active" : "login_required",
        });
      }
    }

    // Always 200 quickly so Plaid doesn't retry a handled webhook.
    return new Response("ok", { status: 200 });
  }),
});

// Stripe billing webhook. Signature-verified (async provider — the Convex
// runtime has Web Crypto, not Node crypto). Strategy: every subscription event
// re-fetches the subscription from Stripe and upserts that FULL current state
// onto the user row — idempotent, and immune to out-of-order event delivery
// because we never trust the event's embedded (possibly stale) snapshot.
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const key = process.env.STRIPE_SECRET_KEY;
    const priceIdMonthly = process.env.STRIPE_PRICE_ID_MONTHLY;
    const priceIdYearly = process.env.STRIPE_PRICE_ID_YEARLY;
    if (!secret || !key || !priceIdMonthly || !priceIdYearly) {
      // 500 so Stripe retries once env is fixed — a missing price ID would
      // otherwise silently classify every subscription as "monthly".
      console.error("[stripe webhook] missing STRIPE_* env vars");
      return new Response("not configured", { status: 500 });
    }

    const stripe = new Stripe(key, {
      httpClient: Stripe.createFetchHttpClient(),
    });
    const signature = request.headers.get("stripe-signature");
    if (!signature) return new Response("missing signature", { status: 400 });

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        await request.text(),
        signature,
        secret,
        undefined,
        Stripe.createSubtleCryptoProvider(),
      );
    } catch (err) {
      console.error("[stripe webhook] bad signature", err);
      return new Response("bad signature", { status: 400 });
    }

    const priceIds = { monthly: priceIdMonthly, yearly: priceIdYearly };

    // Always sync from a fresh retrieve — the event's object can be stale
    // (Stripe does not guarantee delivery order; see billing.syncSubscription).
    const syncFromSubscriptionId = async (subscriptionId: string) => {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const itemPriceId = sub.items?.data?.[0]?.price?.id;
      if (itemPriceId && itemPriceId !== priceIds.monthly && itemPriceId !== priceIds.yearly) {
        // Env/price misconfig: keep syncing (status drives access; a hard fail
        // would deny a paid user) but make the wrong-plan default visible.
        console.error("[stripe webhook] unknown price id", itemPriceId, "— plan defaulted to monthly");
      }
      const patch = subscriptionPatchFromStripe(
        sub as unknown as StripeSubscriptionLike,
        priceIds,
      );
      await ctx.runMutation(internal.billing.syncSubscription, {
        userId: sub.metadata?.userId || undefined,
        ...patch,
      });
    };

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        // Link the customer immediately; the subscription events (created
        // alongside) carry the same state, but fetch it here too so a dropped
        // sibling event can't leave us stale.
        if (session.metadata?.userId && typeof session.customer === "string") {
          await ctx.runMutation(internal.billing.setStripeCustomerId, {
            userId: session.metadata.userId,
            stripeCustomerId: session.customer,
          });
        }
        if (typeof session.subscription === "string") {
          await syncFromSubscriptionId(session.subscription);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncFromSubscriptionId(event.data.object.id);
        break;
      }
    }

    return new Response("ok", { status: 200 });
  }),
});

export default http;
