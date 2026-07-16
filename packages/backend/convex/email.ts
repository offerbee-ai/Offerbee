import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// ── Brevo integration ───────────────────────────────────────────────────────
// Mirrors push.ts: internalAction that POSTs to an external HTTP API. All
// functions are internal — never called from the client. Sender domain
// offerbee.ai is authenticated in Brevo (SPF/DKIM/DMARC live).

const BREVO_SMTP_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_CONTACTS_URL = "https://api.brevo.com/v3/contacts";
const SENDER = { email: "no-reply@offerbee.ai", name: "OfferBee" } as const;

function brevoApiKey(): string {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error("Missing BREVO_API_KEY in Convex environment");
  return key;
}

// Send one templated transactional email via Brevo.
// Throws on non-2xx so the failure surfaces in Convex logs. NOTE: Convex does
// not auto-retry a failed action — a transient Brevo error is logged, not
// retried, so the welcome is skipped. The welcomeEmailSentAt guard makes a
// manual re-run safe. A cron sweep for unsent welcomes is a possible follow-up.
async function postBrevoEmail(args: {
  to: string;
  templateId: number;
  params?: Record<string, unknown>;
}): Promise<string | null> {
  const res = await fetch(BREVO_SMTP_URL, {
    method: "POST",
    headers: {
      "api-key": brevoApiKey(),
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: args.to }],
      templateId: args.templateId,
      params: args.params ?? {},
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo send failed ${res.status}: ${body}`);
  }
  // Brevo normally returns JSON with a messageId, but guard against an empty or
  // non-JSON 2xx body so a successful send is never misreported as a failure.
  const text = await res.text();
  const data = text ? (JSON.parse(text) as { messageId?: string }) : {};
  return data.messageId ?? null;
}

export const sendTransactionalEmail = internalAction({
  args: {
    to: v.string(),
    templateId: v.number(),
    params: v.optional(v.record(v.string(), v.any())),
  },
  handler: async (_ctx, args) => postBrevoEmail(args),
});

// Read just what the welcome flow needs (kept internal).
export const getUserForEmail = internalQuery({
  args: { userDocId: v.id("users") },
  handler: async (ctx, { userDocId }) => {
    const user = await ctx.db.get(userDocId);
    if (!user) return null;
    return {
      email: user.email ?? null,
      name: user.name ?? null,
      welcomeEmailSentAt: user.welcomeEmailSentAt ?? null,
    };
  },
});

// Stamp the idempotency guard after a successful welcome send.
export const markWelcomeSent = internalMutation({
  args: { userDocId: v.id("users") },
  handler: async (ctx, { userDocId }) => {
    await ctx.db.patch(userDocId, { welcomeEmailSentAt: Date.now() });
  },
});

// Idempotent welcome send. Scheduled from users.ensureUser on first insert.
export const sendWelcomeEmail = internalAction({
  args: { userDocId: v.id("users") },
  handler: async (ctx, { userDocId }) => {
    const user: {
      email: string | null;
      name: string | null;
      welcomeEmailSentAt: number | null;
    } | null = await ctx.runQuery(internal.email.getUserForEmail, { userDocId });
    if (!user) return;
    if (user.welcomeEmailSentAt) return; // already sent
    if (!user.email) {
      console.warn(
        `sendWelcomeEmail: user ${userDocId} has no email; skipping`,
      );
      return; // never throw on a missing email
    }

    const templateId = Number(process.env.BREVO_WELCOME_TEMPLATE_ID);
    if (!templateId) {
      throw new Error("Missing BREVO_WELCOME_TEMPLATE_ID in Convex environment");
    }

    // Param keys must match the Brevo template's {{ params.* }} vars
    // (see Design/design_handoff_welcome_email). firstName = greeting name.
    await postBrevoEmail({
      to: user.email,
      templateId,
      params: { firstName: user.name?.split(" ")[0] ?? "there" },
    });
    // Stamp AFTER a confirmed send. The window between send and stamp is
    // negligible today (no retry path); revisit if retries are added.
    await ctx.runMutation(internal.email.markWelcomeSent, { userDocId });
  },
});

// Create-or-update a marketing contact and add it to the marketing list.
// updateEnabled:true makes re-runs idempotent (no "already exists" error).
export const upsertBrevoContact = internalAction({
  args: {
    email: v.string(),
    attributes: v.optional(v.object({ FIRSTNAME: v.optional(v.string()) })),
  },
  handler: async (_ctx, { email, attributes }) => {
    const listId = Number(process.env.BREVO_MARKETING_LIST_ID);
    if (!listId) {
      throw new Error("Missing BREVO_MARKETING_LIST_ID in Convex environment");
    }
    const res = await fetch(BREVO_CONTACTS_URL, {
      method: "POST",
      headers: {
        "api-key": brevoApiKey(),
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        email,
        attributes: attributes ?? {},
        listIds: [listId],
        updateEnabled: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Brevo contact upsert failed ${res.status}: ${body}`);
    }
  },
});
