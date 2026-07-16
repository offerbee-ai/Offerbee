import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

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
      // SYNC_UPDATES_AVAILABLE (and the legacy *_UPDATE codes) → pull deltas.
      await ctx.scheduler.runAfter(0, internal.plaid.syncItem, { itemId });
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

export default http;
