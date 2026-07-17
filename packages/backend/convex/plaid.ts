import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { getUserId, requireUserId } from "./auth";
import { periodKey } from "./benefitCycles";
import {
  COVERED_RATIO,
  cappedUsageAmount,
  isCreditLabeled,
  isRecurringReimbursement,
  isStatementCreditFor,
  matchBenefitToTransaction,
  resolveSuggestion,
} from "./plaidMatch";
import { llmClassify } from "./plaidLlm";
import { normalizeTxn } from "./plaidNormalize";
import { deriveDetected, type DetectedAccount } from "./plaidDetect";
import { POPULAR_CARD_KEYS } from "./catalog";
import { fetchAndSaveCardDetail } from "./rapidapi";
import { missingEnvVariableUrl } from "./utils";

// Plaid runs in Convex's default runtime via plain fetch() — every call is a
// JSON POST with client_id/secret in the body (mirrors rapidapi.ts; no npm SDK
// or "use node" needed). See DEPLOYMENT.md for PLAID_* env vars.

const PLAID_KEYS_URL = "https://dashboard.plaid.com/developers/keys";

function plaidBaseUrl(): string {
  return process.env.PLAID_ENV === "production"
    ? "https://production.plaid.com"
    : "https://sandbox.plaid.com";
}

// POST a Plaid endpoint with credentials injected; throws a readable error on
// missing config or a non-2xx (Plaid returns { error_code, error_message }).
async function plaidRequest<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) {
    throw new Error(missingEnvVariableUrl("PLAID_SECRET", PLAID_KEYS_URL));
  }
  const res = await fetch(`${plaidBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const detail = json?.error_code
      ? `${json.error_code}: ${json.error_message ?? ""}`
      : `HTTP ${res.status}`;
    throw new Error(`Plaid ${path} failed — ${detail}`);
  }
  return json as T;
}

// ── Status ──────────────────────────────────────────────────────────────────

export const plaidConfigured = query({
  args: {},
  handler: async () =>
    Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET),
});

// ── Link flow (client → these actions) ────────────────────────────────────────

// Short-lived link_token the client SDK opens Link with.
export const createLinkToken = action({
  args: {},
  handler: async (ctx): Promise<{ linkToken: string }> => {
    const userId = await requireUserId(ctx);
    const site = process.env.CONVEX_SITE_URL;
    const body: Record<string, unknown> = {
      client_name: "OfferBee",
      language: "en",
      country_codes: ["US"],
      user: { client_user_id: userId },
      products: ["transactions"],
      // Request up to 24 months of history so the first sync covers year-to-date
      // (default is 90 days). Applies to new/re-linked Items.
      transactions: { days_requested: 730 },
    };
    if (site) body.webhook = `${site}/plaid/webhook`;
    const json = await plaidRequest<{ link_token: string }>(
      "/link/token/create",
      body,
    );
    return { linkToken: json.link_token };
  },
});

// Exchange Link's public_token → access_token (persisted, secret) + accounts.
export const exchangePublicToken = action({
  args: {
    publicToken: v.string(),
    institutionId: v.optional(v.string()),
    institutionName: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { publicToken, institutionId, institutionName },
  ): Promise<{
    itemId: string;
    institutionName?: string;
    accounts: DetectedAccount[];
  }> => {
    const userId = await requireUserId(ctx);
    const ex = await plaidRequest<{ access_token: string; item_id: string }>(
      "/item/public_token/exchange",
      { public_token: publicToken },
    );
    const acctResp = await plaidRequest<{
      accounts: any[];
      item?: { institution_id?: string };
    }>("/accounts/get", { access_token: ex.access_token });

    await ctx.runMutation(internal.plaid.savePlaidItem, {
      userId,
      itemId: ex.item_id,
      accessToken: ex.access_token,
      institutionId: institutionId ?? acctResp.item?.institution_id,
      institutionName,
    });

    const accounts = (acctResp.accounts ?? []).map((a) => ({
      accountId: String(a.account_id),
      mask: a.mask ?? undefined,
      name: a.name ?? undefined,
      officialName: a.official_name ?? undefined,
      subtype: a.subtype ?? undefined,
    }));
    console.log(
      `[plaid exchange] item=${ex.item_id} institution="${institutionName ?? "?"}" accounts=` +
        JSON.stringify(
          accounts.map((a) => ({
            name: a.name,
            official: a.officialName,
            mask: a.mask,
            subtype: a.subtype,
          })),
        ),
    );
    await ctx.runMutation(internal.plaid.savePlaidAccounts, {
      userId,
      itemId: ex.item_id,
      accounts,
    });

    // No auto-add: detection results go back to the client, which shows the
    // review screen ("We found your cards") — nothing enters the wallet until
    // the user confirms (confirmDetectedCards). The first sync still runs now;
    // linkAccountToCard back-fills and re-classifies transactions after the
    // user links, so no data is lost by syncing before linking.
    const detected = deriveDetected(accounts, institutionName);

    await ctx.scheduler.runAfter(0, internal.plaid.syncItem, {
      itemId: ex.item_id,
    });

    return { itemId: ex.item_id, institutionName, accounts: detected };
  },
});

// ── Internal writers (actions can't touch the DB directly) ────────────────────

export const savePlaidItem = internalMutation({
  args: {
    userId: v.string(),
    itemId: v.string(),
    accessToken: v.string(),
    institutionId: v.optional(v.string()),
    institutionName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("plaidItems")
      .withIndex("by_itemId", (q) => q.eq("itemId", args.itemId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        institutionId: args.institutionId,
        institutionName: args.institutionName,
        status: "active",
      });
      return existing._id;
    }
    return await ctx.db.insert("plaidItems", {
      userId: args.userId,
      itemId: args.itemId,
      accessToken: args.accessToken,
      institutionId: args.institutionId,
      institutionName: args.institutionName,
      status: "active",
      createdAt: Date.now(),
    });
  },
});

export const savePlaidAccounts = internalMutation({
  args: {
    userId: v.string(),
    itemId: v.string(),
    accounts: v.array(
      v.object({
        accountId: v.string(),
        mask: v.optional(v.string()),
        name: v.optional(v.string()),
        officialName: v.optional(v.string()),
        subtype: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { userId, itemId, accounts }) => {
    for (const a of accounts) {
      const existing = await ctx.db
        .query("plaidAccounts")
        .withIndex("by_accountId", (q) => q.eq("accountId", a.accountId))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          mask: a.mask,
          name: a.name,
          officialName: a.officialName,
          subtype: a.subtype,
        });
        continue;
      }
      await ctx.db.insert("plaidAccounts", {
        userId,
        itemId,
        accountId: a.accountId,
        mask: a.mask,
        name: a.name,
        officialName: a.officialName,
        subtype: a.subtype,
        createdAt: Date.now(),
      });
    }
  },
});

// ── Account ↔ wallet-card linking ─────────────────────────────────────────────

export const linkAccountToCard = mutation({
  args: {
    accountId: v.string(),
    userCardId: v.union(v.id("userCards"), v.null()), // null unlinks
  },
  handler: async (ctx, { accountId, userCardId }) => {
    const userId = await requireUserId(ctx);
    const account = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_accountId", (q) => q.eq("accountId", accountId))
      .unique();
    if (!account || account.userId !== userId)
      throw new Error("Account not found");

    if (userCardId !== null) {
      const card = await ctx.db.get(userCardId);
      if (!card || card.userId !== userId) throw new Error("Card not found");
    }

    await ctx.db.patch(account._id, { userCardId: userCardId ?? undefined });

    // Back-fill already-synced transactions for this account and re-classify now
    // that they know their card (initial sync may have run pre-link). Refunds
    // before purchases so purchase candidacy sees refund usage.
    const txns = await ctx.db
      .query("plaidTransactions")
      .withIndex("by_accountId", (q) => q.eq("accountId", accountId))
      .take(500);
    for (const t of txns)
      await ctx.db.patch(t._id, { userCardId: userCardId ?? undefined });
    const fresh = (
      await Promise.all(txns.map((t) => ctx.db.get(t._id)))
    ).filter((d): d is Doc<"plaidTransactions"> => d !== null);
    fresh.sort((a, b) => a.amount - b.amount);
    for (const d of fresh) await classifyTransaction(ctx, d);
  },
});

// Add a catalog card to the wallet (idempotent) → seed its benefits → link the
// account. Shared by the single-account picker (settings) and the post-connect
// review screen's batch confirm. Backs the picker shown when resolveCardKey
// can't identify the product — e.g. Chase's OAuth feed names every UR card
// "Ultimate Rewards®", so only the user can say which account is which card.
async function addAndLinkOne(
  ctx: ActionCtx,
  accountId: string,
  cardKey: string,
): Promise<Id<"userCards">> {
  // Popular keys pass outright; anything else must already be in cardCatalog
  // (searchCards upserts every result it returns, so search picks qualify).
  if (!POPULAR_CARD_KEYS.includes(cardKey)) {
    const known: boolean = await ctx.runQuery(internal.catalog.hasCard, {
      cardKey,
    });
    if (!known) throw new Error("Unknown card");
  }
  // Search-picked cards usually have no cached detail yet (name search
  // returns only key/name/issuer), and benefits can't seed without one.
  // Fetch it inline — we're in an action — so the card's benefits are
  // tracked by the time this returns and the benefits page shows them
  // immediately, matching a manual add from the wallet. It also lets
  // linkAccountToCard's transaction re-classification below match the
  // seeded benefits instead of waiting for the next sync. If the fetch
  // fails, addCard still schedules the lazy fetch as the retry path.
  const hasDetail: boolean = await ctx.runQuery(
    internal.catalog.hasCardDetail,
    { cardKey },
  );
  if (!hasDetail) await fetchAndSaveCardDetail(ctx, cardKey);
  // Ownership of the account (and auth) is enforced inside each mutation.
  const userCardId: Id<"userCards"> = await ctx.runMutation(
    api.wallet.addCard,
    { cardKey },
  );
  await ctx.runMutation(internal.benefits.seedCardBenefits, { userCardId });
  await ctx.runMutation(api.plaid.linkAccountToCard, { accountId, userCardId });
  return userCardId;
}

export const linkAccountToCatalogCard = action({
  args: { accountId: v.string(), cardKey: v.string() },
  handler: async (
    ctx,
    { accountId, cardKey },
  ): Promise<{ userCardId: Id<"userCards"> }> => {
    const userCardId = await addAndLinkOne(ctx, accountId, cardKey);
    return { userCardId };
  },
});

// Batch confirm from the review screen: each selection adds the card to the
// wallet (idempotent) and links its bank account. Unselected accounts are
// simply not passed — they stay connected but unlinked (fixable in Settings).
export const confirmDetectedCards = action({
  args: {
    itemId: v.string(),
    selections: v.array(
      v.object({ accountId: v.string(), cardKey: v.string() }),
    ),
  },
  handler: async (ctx, { itemId, selections }) => {
    await requireUserId(ctx);
    // One card ↔ one account: reject duplicate cardKeys or accountIds before
    // any writes (the client prevents this, but don't trust it).
    const keys = selections.map((s) => s.cardKey);
    if (new Set(keys).size !== keys.length)
      throw new Error("Each card can only be linked to one account");
    const accountIds = selections.map((s) => s.accountId);
    if (new Set(accountIds).size !== accountIds.length)
      throw new Error("Each account can only be linked to one card");
    // Validate every key up front so a bad selection can't leave the batch
    // half-applied (each add+link is idempotent, but partial application with
    // an opaque error would silently drop the trailing selections).
    for (const s of selections) {
      if (!POPULAR_CARD_KEYS.includes(s.cardKey)) {
        const known: boolean = await ctx.runQuery(internal.catalog.hasCard, {
          cardKey: s.cardKey,
        });
        if (!known) throw new Error("Unknown card");
      }
    }
    for (const s of selections) {
      await addAndLinkOne(ctx, s.accountId, s.cardKey);
    }
    // Re-run the item's sync so the suggestion pass sees the newly linked
    // cards now instead of waiting for the 6-hour cron (cursor makes it cheap).
    await ctx.scheduler.runAfter(0, internal.plaid.syncItem, { itemId });
  },
});

// ── Matching + auto-log helpers (shared by applySync + linkAccountToCard) ──────

// One auto usage per transaction, kept in sync on modify. Idempotent.
// amountOverride lets cap-aware callers log less than the txn magnitude.
async function ensureAutoUsage(
  ctx: MutationCtx,
  txn: Doc<"plaidTransactions">,
  benefit: Doc<"userBenefits">,
  amountOverride?: number,
) {
  const pk = periodKey(benefit.cycle, txn.date); // attribute to the txn's period
  const amt = amountOverride ?? Math.abs(txn.amount); // credit postings are negative; log magnitude
  const existing = (
    await ctx.db
      .query("benefitUsages")
      .withIndex("by_transactionId", (q) =>
        q.eq("transactionId", txn.transactionId),
      )
      .take(1)
  )[0];
  if (existing) {
    // Re-point the benefit too: after a re-link to a different card, the txn
    // re-matches against the new card's benefits and the old row would
    // otherwise keep crediting the wrong card.
    if (
      existing.amount !== amt ||
      existing.periodKey !== pk ||
      existing.userBenefitId !== benefit._id ||
      existing.cardKey !== benefit.cardKey
    )
      await ctx.db.patch(existing._id, {
        amount: amt,
        periodKey: pk,
        userBenefitId: benefit._id,
        cardKey: benefit.cardKey,
      });
    return;
  }
  await ctx.db.insert("benefitUsages", {
    userId: txn.userId,
    userBenefitId: benefit._id,
    cardKey: benefit.cardKey,
    periodKey: pk,
    amount: amt,
    usedAt: txn.date,
    source: "auto",
    transactionId: txn.transactionId,
  });
}

async function removeAutoUsage(ctx: MutationCtx, transactionId: string) {
  const rows = await ctx.db
    .query("benefitUsages")
    .withIndex("by_transactionId", (q) => q.eq("transactionId", transactionId))
    .take(10);
  for (const r of rows) if (r.source === "auto") await ctx.db.delete(r._id);
}

// Flip a suggested purchase to "skipped" when logic already has the answer:
// the issuer effectively captured the period (≥80% posted), or the period
// ended and confirming can't change anything. Detected keeps only "open".
async function retireIfResolved(
  ctx: MutationCtx,
  txn: Doc<"plaidTransactions">,
) {
  if (!txn.matchedBenefitId) return;
  const benefit = await ctx.db.get(txn.matchedBenefitId);
  if (!benefit) return;
  const other = await periodUsageExcluding(
    ctx,
    benefit._id,
    periodKey(benefit.cycle, txn.date),
    txn.transactionId,
  );
  const state = resolveSuggestion(benefit, txn.date, other, Date.now());
  if (state !== "open")
    await ctx.db.patch(txn._id, { matchStatus: "skipped" });
}

// A benefit's usage for one period, excluding a given transaction's own row (so
// re-matching a transaction doesn't count itself). Used to enforce the per-period
// cap: once a credit is used up for a period, further transactions are skipped.
async function periodUsageExcluding(
  ctx: QueryCtx,
  userBenefitId: Id<"userBenefits">,
  pk: string,
  excludeTransactionId: string,
): Promise<number> {
  const rows = await ctx.db
    .query("benefitUsages")
    .withIndex("by_userBenefitId_and_periodKey", (q) =>
      q.eq("userBenefitId", userBenefitId).eq("periodKey", pk),
    )
    .take(100);
  const sum = rows
    .filter((r) => r.transactionId !== excludeTransactionId)
    .reduce((a, r) => a + r.amount, 0);
  return Math.round(sum * 100) / 100;
}

// Start of the current calendar year (UTC). Credits reset yearly and the grid
// shows this year, so only current-year transactions are matched.
const currentYearStart = () =>
  Date.UTC(new Date(Date.now()).getUTCFullYear(), 0, 1);

// Auto-log a benefit for a transaction, respecting the per-period cap.
async function autoLogWithCap(
  ctx: MutationCtx,
  txn: Doc<"plaidTransactions">,
  benefit: Doc<"userBenefits">,
) {
  const pk = periodKey(benefit.cycle, txn.date);
  const other = await periodUsageExcluding(
    ctx,
    benefit._id,
    pk,
    txn.transactionId,
  );
  if (other >= benefit.amount) {
    await removeAutoUsage(ctx, txn.transactionId);
    await ctx.db.patch(txn._id, {
      matchStatus: "skipped",
      matchedBenefitId: benefit._id,
    });
    return;
  }
  await ensureAutoUsage(ctx, txn, benefit);
  await ctx.db.patch(txn._id, {
    matchStatus: "auto",
    matchedBenefitId: benefit._id,
  });

  // Period now effectively captured → retire pending suggestions for the same
  // benefit + period, so Detected stops offering purchases the issuer already
  // reimbursed (and a later confirm can't double-log).
  if (
    other + Math.abs(txn.amount) >= benefit.amount * COVERED_RATIO &&
    txn.userCardId
  ) {
    const siblings = await ctx.db
      .query("plaidTransactions")
      .withIndex("by_userCardId", (q) => q.eq("userCardId", txn.userCardId))
      .take(500);
    for (const s of siblings) {
      if (s.matchStatus !== "suggested") continue;
      if (s.matchedBenefitId !== benefit._id) continue;
      if (periodKey(benefit.cycle, s.date) !== pk) continue;
      await ctx.db.patch(s._id, { matchStatus: "skipped" });
    }
  }
}

// Stage 1 — deterministic classification of one stored transaction:
//   • clean credit-refund matched to a curated benefit → AUTO-LOG usage
//   • credit-labeled refund that's ambiguous            → "candidate" (LLM resolves)
//   • purchase plausibly related to a benefit           → "candidate" (LLM filters)
//   • everything else                                   → "none"
// Refunds are authoritative; purchases never auto-log here. Respects terminal
// states (user confirm/dismiss + LLM-surfaced suggestions).
async function classifyTransaction(
  ctx: MutationCtx,
  txn: Doc<"plaidTransactions">,
) {
  if (txn.matchStatus === "confirmed" || txn.matchStatus === "dismissed")
    return;
  if (txn.matchStatus === "suggested") {
    // Re-sweeps retire suggestions logic has since resolved (issuer credit
    // auto-logged, or period expired) instead of re-classifying them.
    await retireIfResolved(ctx, txn);
    return;
  }

  const set = async (
    status: Doc<"plaidTransactions">["matchStatus"],
    benefitId?: Id<"userBenefits">,
  ) => {
    await ctx.db.patch(txn._id, {
      matchStatus: status,
      matchedBenefitId: benefitId,
    });
  };

  // Unlinked / $0 / prior-year → not matched (drop any prior auto usage).
  if (!txn.userCardId || txn.amount === 0 || txn.date < currentYearStart()) {
    await removeAutoUsage(ctx, txn.transactionId);
    await set("none", undefined);
    return;
  }

  const card = await ctx.db.get(txn.userCardId);
  if (!card) return;
  const benefits = (
    await ctx.db
      .query("userBenefits")
      .withIndex("by_userId_and_cardKey", (q) =>
        q.eq("userId", txn.userId).eq("cardKey", card.cardKey),
      )
      .take(100)
  ).filter((b) => b.archivedAt === undefined);

  // originalDescription is the raw statement line — issuers' credit wording
  // often survives there after Plaid's cleaning strips it from name.
  const txnName = `${txn.merchantName ?? ""} ${txn.name ?? ""} ${txn.originalDescription ?? ""}`;
  const matchTxn = {
    merchantName: txn.merchantName,
    name: txn.name,
    originalDescription: txn.originalDescription,
    pfcPrimary: txn.pfcPrimary,
    amount: txn.amount,
  };

  // Refund (negative), strongest signal first:
  //   1. credit-labeled posting cleanly matched to one benefit → auto-log
  //   2. unlabeled but structurally a recurring reimbursement (same merchant,
  //      ~benefit amount, ≥2 prior months — the Amex Walmart+ pattern) → auto-log
  //   3. merchant-plausible for some benefit → candidate (LLM decides)
  //   4. anything else → none
  if (txn.amount < 0) {
    if (isCreditLabeled(txnName)) {
      const matches = benefits.filter((b) =>
        isStatementCreditFor(
          { title: b.title, benefitTitle: b.benefitTitle },
          txnName,
        ),
      );
      if (matches.length === 1) {
        await autoLogWithCap(ctx, txn, matches[0]);
      } else {
        await removeAutoUsage(ctx, txn.transactionId);
        await set("candidate", undefined);
      }
      return;
    }

    const plausible = benefits.filter((b) =>
      matchBenefitToTransaction(
        { title: b.title, benefitTitle: b.benefitTitle },
        matchTxn,
      ),
    );
    if (plausible.length === 0) {
      await removeAutoUsage(ctx, txn.transactionId);
      await set("none", undefined);
      return;
    }

    // Structural check needs account history — fetched only on this rare path.
    const priors = (
      await ctx.db
        .query("plaidTransactions")
        .withIndex("by_accountId", (q) => q.eq("accountId", txn.accountId))
        .take(500)
    )
      .filter((t) => t.amount < 0 && t.transactionId !== txn.transactionId)
      .map((t) => ({
        text: `${t.merchantName ?? ""} ${t.name ?? ""} ${t.originalDescription ?? ""}`,
        amount: t.amount,
        date: t.date,
      }));
    const recurring = plausible.find((b) =>
      isRecurringReimbursement(
        { title: b.title, benefitTitle: b.benefitTitle, amount: b.amount },
        { text: txnName, amount: txn.amount, date: txn.date },
        priors,
      ),
    );
    if (recurring) {
      console.log(
        `[plaid match] recurring reimbursement auto-log txn=${txn.transactionId} $${txn.amount} → "${recurring.title}"`,
      );
      await autoLogWithCap(ctx, txn, recurring);
      return;
    }
    console.log(
      `[plaid match] unlabeled refund → LLM candidate txn=${txn.transactionId} $${txn.amount} (${plausible.length} plausible benefit(s))`,
    );
    await removeAutoUsage(ctx, txn.transactionId);
    await set("candidate", undefined);
    return;
  }

  // Purchase (positive): a plausible benefit relation makes it an LLM candidate.
  const plausible = benefits.find((b) =>
    matchBenefitToTransaction(
      { title: b.title, benefitTitle: b.benefitTitle },
      matchTxn,
    ),
  );
  await set(plausible ? "candidate" : "none", plausible?._id);
}

// ── Transaction sync ──────────────────────────────────────────────────────────

const normalizedTxnValidator = v.object({
  transactionId: v.string(),
  accountId: v.string(),
  merchantName: v.optional(v.string()),
  name: v.optional(v.string()),
  originalDescription: v.optional(v.string()),
  amount: v.number(),
  date: v.number(), // effective/statement date (authorized_date ?? posting date)
  postedDate: v.optional(v.number()),
  pfcPrimary: v.optional(v.string()),
  pfcDetailed: v.optional(v.string()),
  pending: v.boolean(),
});

export const getItemForSync = internalQuery({
  args: { itemId: v.string() },
  handler: async (ctx, { itemId }) => {
    const item = await ctx.db
      .query("plaidItems")
      .withIndex("by_itemId", (q) => q.eq("itemId", itemId))
      .unique();
    if (!item) return null;
    return {
      userId: item.userId,
      accessToken: item.accessToken,
      cursor: item.cursor ?? null,
    };
  },
});

export const setItemStatus = internalMutation({
  args: {
    itemId: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("login_required"),
      v.literal("error"),
    ),
  },
  handler: async (ctx, { itemId, status }) => {
    const item = await ctx.db
      .query("plaidItems")
      .withIndex("by_itemId", (q) => q.eq("itemId", itemId))
      .unique();
    if (item) await ctx.db.patch(item._id, { status });
  },
});

export const saveCursor = internalMutation({
  args: { itemId: v.string(), cursor: v.string() },
  handler: async (ctx, { itemId, cursor }) => {
    const item = await ctx.db
      .query("plaidItems")
      .withIndex("by_itemId", (q) => q.eq("itemId", itemId))
      .unique();
    if (item)
      await ctx.db.patch(item._id, { cursor, lastSyncedAt: Date.now() });
  },
});

export const applySync = internalMutation({
  args: {
    itemId: v.string(),
    userId: v.string(),
    added: v.array(normalizedTxnValidator),
    modified: v.array(normalizedTxnValidator),
    removed: v.array(v.string()), // transaction_ids
  },
  handler: async (ctx, { itemId, userId, added, modified, removed }) => {
    const ids: Id<"plaidTransactions">[] = [];
    for (const t of [...added, ...modified]) {
      const account = await ctx.db
        .query("plaidAccounts")
        .withIndex("by_accountId", (q) => q.eq("accountId", t.accountId))
        .unique();
      const userCardId = account?.userCardId;
      const fields = {
        merchantName: t.merchantName,
        name: t.name,
        originalDescription: t.originalDescription,
        amount: t.amount,
        date: t.date,
        postedDate: t.postedDate,
        pfcPrimary: t.pfcPrimary,
        pfcDetailed: t.pfcDetailed,
        pending: t.pending,
        userCardId,
      };
      const existing = await ctx.db
        .query("plaidTransactions")
        .withIndex("by_transactionId", (q) =>
          q.eq("transactionId", t.transactionId),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, fields);
        ids.push(existing._id);
      } else {
        ids.push(
          await ctx.db.insert("plaidTransactions", {
            userId,
            itemId,
            accountId: t.accountId,
            transactionId: t.transactionId,
            ...fields,
            matchStatus: "none",
            createdAt: Date.now(),
          }),
        );
      }
    }

    // Stage 1: classify refunds before purchases so purchase candidacy sees the
    // refund usage established this batch.
    const fresh = (await Promise.all(ids.map((id) => ctx.db.get(id)))).filter(
      (d): d is Doc<"plaidTransactions"> => d !== null,
    );
    fresh.sort((a, b) => a.amount - b.amount);
    for (const d of fresh) await classifyTransaction(ctx, d);

    for (const txnId of removed) {
      await removeAutoUsage(ctx, txnId);
      const row = await ctx.db
        .query("plaidTransactions")
        .withIndex("by_transactionId", (q) => q.eq("transactionId", txnId))
        .unique();
      if (row) await ctx.db.delete(row._id);
    }
  },
});

// Pull an Item's transaction deltas (cursor loop) and apply them.
export const syncItem = internalAction({
  args: { itemId: v.string() },
  handler: async (ctx, { itemId }) => {
    const item = await ctx.runQuery(internal.plaid.getItemForSync, { itemId });
    if (!item) return;
    console.log(
      `[plaid sync] start item=${itemId} cursor=${item.cursor ? "resume" : "initial"}`,
    );
    let cursor = item.cursor ?? undefined;
    let hasMore = true;
    let guard = 0;
    let totals = { added: 0, modified: 0, removed: 0 };
    while (hasMore && guard++ < 50) {
      const resp = await plaidRequest<{
        added: any[];
        modified: any[];
        removed: any[];
        next_cursor: string;
        has_more: boolean;
      }>("/transactions/sync", {
        access_token: item.accessToken,
        ...(cursor ? { cursor } : {}),
        count: 500,
        // Raw statement text — issuer credit wording ("WALMART+ ... CREDIT")
        // that Plaid's cleaned name/merchant_name drops.
        options: { include_original_description: true },
      });
      const added = resp.added ?? [];
      const modified = resp.modified ?? [];
      const removed = resp.removed ?? [];
      totals = {
        added: totals.added + added.length,
        modified: totals.modified + modified.length,
        removed: totals.removed + removed.length,
      };
      console.log(
        `[plaid sync] item=${itemId} page added=${added.length} modified=${modified.length} removed=${removed.length} has_more=${resp.has_more}` +
          (added[0]
            ? ` sample="${added[0].merchant_name ?? added[0].name}" $${added[0].amount} [${added[0].personal_finance_category?.detailed ?? "?"}]`
            : ""),
      );
      await ctx.runMutation(internal.plaid.applySync, {
        itemId,
        userId: item.userId,
        added: added.map(normalizeTxn),
        modified: modified.map(normalizeTxn),
        removed: removed.map((r) => String(r.transaction_id)),
      });
      cursor = resp.next_cursor;
      hasMore = resp.has_more;
      await ctx.runMutation(internal.plaid.saveCursor, { itemId, cursor });
    }
    console.log(
      `[plaid sync] done item=${itemId} totals added=${totals.added} modified=${totals.modified} removed=${totals.removed}`,
    );

    // Stage 2: LLM-filter this item's candidate transactions, batched per card.
    const cardIds = await ctx.runQuery(internal.plaid.getCandidateCardIds, {
      itemId,
    });
    for (const userCardId of cardIds.slice(0, MAX_CARDS_PER_SYNC)) {
      const data = await ctx.runQuery(internal.plaid.getCandidatesForCard, {
        userCardId,
        limit: LLM_CANDIDATE_CAP,
      });
      if (!data || data.candidates.length === 0) continue;
      const mappings = await llmClassify(
        data.cardName,
        data.benefits,
        data.candidates,
      );
      if (!mappings) continue; // LLM couldn't run — leave candidates pending
      await ctx.runMutation(internal.plaid.applyLlmResults, {
        mappings: mappings.map((m) => ({
          transactionId: m.transactionId,
          benefitId: (m.benefitId as Id<"userBenefits"> | null) ?? null,
        })),
      });
    }
  },
});

const LLM_CANDIDATE_CAP = 50; // max candidate txns sent to the LLM per card per run
const MAX_CARDS_PER_SYNC = 10; // bound the LLM calls per sync

// Distinct linked cards that have pending candidate transactions for this item.
export const getCandidateCardIds = internalQuery({
  args: { itemId: v.string() },
  handler: async (ctx, { itemId }) => {
    const txns = await ctx.db
      .query("plaidTransactions")
      .withIndex("by_itemId", (q) => q.eq("itemId", itemId))
      .take(2000);
    const ids = new Set<Id<"userCards">>();
    for (const t of txns)
      if (t.matchStatus === "candidate" && t.userCardId) ids.add(t.userCardId);
    return Array.from(ids);
  },
});

// A card's pending candidates (current year, capped) + its benefits with the
// remaining allowance this period — the context for the LLM classification.
export const getCandidatesForCard = internalQuery({
  args: { userCardId: v.id("userCards"), limit: v.number() },
  handler: async (ctx, { userCardId, limit }) => {
    const card = await ctx.db.get(userCardId);
    if (!card) return null;
    const now = Date.now();
    const yearStart = Date.UTC(new Date(now).getUTCFullYear(), 0, 1);

    const candidates = (
      await ctx.db
        .query("plaidTransactions")
        .withIndex("by_userCardId", (q) => q.eq("userCardId", userCardId))
        .take(500)
    )
      .filter((t) => t.matchStatus === "candidate" && t.date >= yearStart)
      .slice(0, limit)
      .map((t) => ({
        transactionId: t.transactionId,
        merchantName: t.merchantName,
        name: t.name,
        originalDescription: t.originalDescription,
        amount: t.amount,
        date: t.date,
        pfcPrimary: t.pfcPrimary,
      }));

    const benefitDocs = (
      await ctx.db
        .query("userBenefits")
        .withIndex("by_userId_and_cardKey", (q) =>
          q.eq("userId", card.userId).eq("cardKey", card.cardKey),
        )
        .take(100)
    ).filter((b) => b.archivedAt === undefined);
    const benefits = await Promise.all(
      benefitDocs.map(async (b) => {
        const used = await periodUsageExcluding(
          ctx,
          b._id,
          periodKey(b.cycle, now),
          "",
        );
        return {
          id: b._id as string,
          title: b.title,
          cycle: b.cycle,
          amount: b.amount,
          remaining: Math.max(0, Math.round((b.amount - used) * 100) / 100),
        };
      }),
    );

    return {
      cardName: card.nickname ?? card.cardKey,
      benefits,
      candidates,
    };
  },
});

// Apply the LLM's mappings: refund candidate → auto-log (cap-checked); purchase
// candidate → suggestion; unmapped → none. Only acts on still-pending candidates.
export const applyLlmResults = internalMutation({
  args: {
    mappings: v.array(
      v.object({
        transactionId: v.string(),
        benefitId: v.union(v.id("userBenefits"), v.null()),
      }),
    ),
  },
  handler: async (ctx, { mappings }) => {
    for (const m of mappings) {
      const txn = await ctx.db
        .query("plaidTransactions")
        .withIndex("by_transactionId", (q) =>
          q.eq("transactionId", m.transactionId),
        )
        .unique();
      if (!txn || txn.matchStatus !== "candidate") continue;

      if (!m.benefitId) {
        await ctx.db.patch(txn._id, {
          matchStatus: "none",
          matchedBenefitId: undefined,
        });
        continue;
      }
      const benefit = await ctx.db.get(m.benefitId);
      if (!benefit || benefit.userId !== txn.userId) {
        await ctx.db.patch(txn._id, { matchStatus: "none" });
        continue;
      }
      if (txn.amount < 0) {
        await autoLogWithCap(ctx, txn, benefit); // ambiguous refund resolved
      } else {
        // Only surface what the user can still act on: covered or expired
        // periods are logic's to resolve, not the user's.
        const other = await periodUsageExcluding(
          ctx,
          benefit._id,
          periodKey(benefit.cycle, txn.date),
          txn.transactionId,
        );
        const state = resolveSuggestion(benefit, txn.date, other, Date.now());
        await ctx.db.patch(txn._id, {
          matchStatus: state === "open" ? "suggested" : "skipped",
          matchedBenefitId: benefit._id,
        });
      }
    }
  },
});

// Maintenance: clear an item's sync cursor so the next syncItem re-pulls full
// history — used to backfill newly-requested fields (originalDescription) onto
// existing rows; applySync patches by transactionId, so no duplicates.
export const resetItemCursor = internalMutation({
  args: { itemId: v.string() },
  handler: async (ctx, { itemId }) => {
    const item = await ctx.db
      .query("plaidItems")
      .withIndex("by_itemId", (q) => q.eq("itemId", itemId))
      .unique();
    if (item) await ctx.db.patch(item._id, { cursor: undefined });
  },
});

// Maintenance: re-run stage-1 classification over an item's stored transactions
// (e.g. after widening the matcher). classifyTransaction itself respects
// terminal states (confirmed/dismissed/suggested). Paged to stay inside
// mutation limits; kicks off syncItem at the end so stage 2 (LLM) picks up any
// new candidates. Run: npx convex run plaid:reclassifyItemTxns '{"itemId":"..."}'
export const reclassifyItemTxns = internalMutation({
  args: { itemId: v.string(), cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { itemId, cursor }) => {
    const page = await ctx.db
      .query("plaidTransactions")
      .withIndex("by_itemId", (q) => q.eq("itemId", itemId))
      .paginate({ numItems: 50, cursor: cursor ?? null });
    const docs = [...page.page].sort((a, b) => a.amount - b.amount); // refunds first
    for (const d of docs) await classifyTransaction(ctx, d);
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.plaid.reclassifyItemTxns, {
        itemId,
        cursor: page.continueCursor,
      });
    } else {
      console.log(`[plaid reclassify] done item=${itemId}, scheduling LLM pass`);
      await ctx.scheduler.runAfter(0, internal.plaid.syncItem, { itemId });
    }
  },
});

export const getItemsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), limit: v.number() },
  handler: async (ctx, { cursor, limit }) => {
    const page = await ctx.db
      .query("plaidItems")
      .paginate({ numItems: limit, cursor });
    return {
      itemIds: page.page.map((i) => i.itemId),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

// Cron entry: page all Items, spacing each sync to respect rate limits.
export const syncAllItems = internalAction({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.runQuery(internal.plaid.getItemsPage, {
      cursor,
      limit: 20,
    });
    page.itemIds.forEach((itemId, i) => {
      void ctx.scheduler.runAfter(i * 1500, internal.plaid.syncItem, { itemId });
    });
    if (!page.isDone)
      await ctx.scheduler.runAfter(30_000, internal.plaid.syncAllItems, {
        cursor: page.continueCursor,
      });
  },
});

// Retire an item's suggestions that logic has since resolved (period expired,
// or issuer credit covered it). Cheap: touches suggested rows only.
export const retireResolvedSuggestions = internalMutation({
  args: { itemId: v.string(), userId: v.string() },
  handler: async (ctx, { itemId, userId }) => {
    const rows = (
      await ctx.db
        .query("plaidTransactions")
        .withIndex("by_userId_and_matchStatus", (q) =>
          q.eq("userId", userId).eq("matchStatus", "suggested"),
        )
        .take(200)
    ).filter((t) => t.itemId === itemId);
    for (const t of rows) await retireIfResolved(ctx, t);
  },
});

// Cron entry: daily pass so suggestions stop asking once their period lapses.
export const retireAllResolvedSuggestions = internalAction({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.runQuery(internal.plaid.getItemsPageWithUsers, {
      cursor,
      limit: 50,
    });
    for (const it of page.items)
      await ctx.runMutation(internal.plaid.retireResolvedSuggestions, it);
    if (!page.isDone)
      await ctx.scheduler.runAfter(5_000, internal.plaid.retireAllResolvedSuggestions, {
        cursor: page.continueCursor,
      });
  },
});

export const getItemsPageWithUsers = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), limit: v.number() },
  handler: async (ctx, { cursor, limit }) => {
    const page = await ctx.db
      .query("plaidItems")
      .paginate({ numItems: limit, cursor });
    return {
      items: page.page.map((i) => ({ itemId: i.itemId, userId: i.userId })),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

// ── Suggestions: confirm / dismiss ────────────────────────────────────────────

export const confirmSuggestion = mutation({
  args: { transactionId: v.string() },
  handler: async (ctx, { transactionId }) => {
    const userId = await requireUserId(ctx);
    const txn = await ctx.db
      .query("plaidTransactions")
      .withIndex("by_transactionId", (q) =>
        q.eq("transactionId", transactionId),
      )
      .unique();
    if (!txn || txn.userId !== userId) throw new Error("Transaction not found");
    if (!txn.matchedBenefitId) throw new Error("No matched benefit");
    const benefit = await ctx.db.get(txn.matchedBenefitId);
    if (!benefit || benefit.userId !== userId)
      throw new Error("Benefit not found");
    // Clamp to the period's remaining allowance: a $738 hotel stay against a
    // $600 credit captures $600; a period already covered logs nothing (the
    // issuer's own credit posting may have auto-logged it first).
    const pk = periodKey(benefit.cycle, txn.date);
    const other = await periodUsageExcluding(
      ctx,
      benefit._id,
      pk,
      txn.transactionId,
    );
    const amt = cappedUsageAmount(benefit.amount, other, txn.amount);
    if (amt > 0) await ensureAutoUsage(ctx, txn, benefit, amt);
    await ctx.db.patch(txn._id, { matchStatus: "confirmed" });
  },
});

export const dismissSuggestion = mutation({
  args: { transactionId: v.string() },
  handler: async (ctx, { transactionId }) => {
    const userId = await requireUserId(ctx);
    const txn = await ctx.db
      .query("plaidTransactions")
      .withIndex("by_transactionId", (q) =>
        q.eq("transactionId", transactionId),
      )
      .unique();
    if (!txn || txn.userId !== userId) throw new Error("Transaction not found");
    await ctx.db.patch(txn._id, { matchStatus: "dismissed" });
  },
});

// ── Reads: suggestion feed + per-card transaction list ────────────────────────

export const listSuggestions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("plaidTransactions")
      .withIndex("by_userId_and_matchStatus", (q) =>
        q.eq("userId", userId).eq("matchStatus", "suggested"),
      )
      .take(50);
    const out = await Promise.all(
      rows.map(async (t) => {
        const benefit = t.matchedBenefitId
          ? await ctx.db.get(t.matchedBenefitId)
          : null;
        // Read-time guard: rows resolve lazily (the daily sweep flips them),
        // but Detected must never show covered/expired periods.
        if (benefit) {
          const other = await periodUsageExcluding(
            ctx,
            benefit._id,
            periodKey(benefit.cycle, t.date),
            t.transactionId,
          );
          if (resolveSuggestion(benefit, t.date, other, Date.now()) !== "open")
            return null;
        }
        return {
          transactionId: t.transactionId,
          merchantName: t.merchantName ?? t.name ?? "Transaction",
          amount: t.amount,
          date: t.date,
          benefitId: t.matchedBenefitId ?? null,
          benefitTitle: benefit?.title ?? null,
          cardKey: benefit?.cardKey ?? null,
        };
      }),
    );
    return out.filter((r) => r !== null);
  },
});

export const listCardTransactions = query({
  args: { cardKey: v.string() },
  handler: async (ctx, { cardKey }) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    const cards = await ctx.db
      .query("userCards")
      .withIndex("by_userId_and_cardKey", (q) =>
        q.eq("userId", userId).eq("cardKey", cardKey),
      )
      .take(5);
    const out: {
      transactionId: string;
      merchantName: string;
      amount: number;
      date: number;
      matchStatus: string;
    }[] = [];
    for (const card of cards) {
      const txns = await ctx.db
        .query("plaidTransactions")
        .withIndex("by_userCardId", (q) => q.eq("userCardId", card._id))
        .take(50);
      for (const t of txns)
        out.push({
          transactionId: t.transactionId,
          merchantName: t.merchantName ?? t.name ?? "Transaction",
          amount: t.amount,
          date: t.date,
          matchStatus: t.matchStatus,
        });
    }
    return out.sort((a, b) => b.date - a.date).slice(0, 50);
  },
});

// ── Disconnect ────────────────────────────────────────────────────────────────

export const getAccessTokenForItem = internalQuery({
  args: { itemId: v.string(), userId: v.string() },
  handler: async (ctx, { itemId, userId }) => {
    const item = await ctx.db
      .query("plaidItems")
      .withIndex("by_itemId", (q) => q.eq("itemId", itemId))
      .unique();
    if (!item || item.userId !== userId) return null;
    return item.accessToken;
  },
});

export const deleteItemData = internalMutation({
  args: { itemId: v.string(), userId: v.string() },
  handler: async (ctx, { itemId, userId }) => {
    const item = await ctx.db
      .query("plaidItems")
      .withIndex("by_itemId", (q) => q.eq("itemId", itemId))
      .unique();
    if (!item || item.userId !== userId) return;
    const txns = await ctx.db
      .query("plaidTransactions")
      .withIndex("by_itemId", (q) => q.eq("itemId", itemId))
      .take(2000);
    for (const t of txns) {
      await removeAutoUsage(ctx, t.transactionId);
      await ctx.db.delete(t._id);
    }
    const accounts = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_itemId", (q) => q.eq("itemId", itemId))
      .take(100);
    for (const a of accounts) await ctx.db.delete(a._id);
    await ctx.db.delete(item._id);
  },
});

export const removeConnection = action({
  args: { itemId: v.string() },
  handler: async (ctx, { itemId }) => {
    const userId = await requireUserId(ctx);
    const accessToken = await ctx.runQuery(
      internal.plaid.getAccessTokenForItem,
      { itemId, userId },
    );
    if (!accessToken) throw new Error("Connection not found");
    try {
      await plaidRequest("/item/remove", { access_token: accessToken });
    } catch (e) {
      console.error("Plaid /item/remove failed (continuing to delete)", e);
    }
    await ctx.runMutation(internal.plaid.deleteItemData, { itemId, userId });
  },
});

// ── Re-auth (Plaid Link update mode) ─────────────────────────────────────────
// When an Item goes login_required/error, re-authenticate it in place instead of
// disconnecting + reconnecting. Passing access_token (and NO products) to
// /link/token/create puts Link into update mode; on success the Item is repaired.

export const createUpdateLinkToken = action({
  args: { itemId: v.string() },
  handler: async (ctx, { itemId }): Promise<{ linkToken: string }> => {
    const userId = await requireUserId(ctx);
    const accessToken = await ctx.runQuery(
      internal.plaid.getAccessTokenForItem,
      { itemId, userId },
    );
    if (!accessToken) throw new Error("Connection not found");
    const site = process.env.CONVEX_SITE_URL;
    const body: Record<string, unknown> = {
      client_name: "OfferBee",
      language: "en",
      country_codes: ["US"],
      user: { client_user_id: userId },
      access_token: accessToken, // update mode — do NOT pass products
    };
    if (site) body.webhook = `${site}/plaid/webhook`;
    const json = await plaidRequest<{ link_token: string }>(
      "/link/token/create",
      body,
    );
    return { linkToken: json.link_token };
  },
});

// Called after a successful update-mode Link: mark the Item healthy and re-sync.
export const reactivateItem = mutation({
  args: { itemId: v.string() },
  handler: async (ctx, { itemId }) => {
    const userId = await requireUserId(ctx);
    const item = await ctx.db
      .query("plaidItems")
      .withIndex("by_itemId", (q) => q.eq("itemId", itemId))
      .unique();
    if (!item || item.userId !== userId) throw new Error("Connection not found");
    await ctx.db.patch(item._id, { status: "active" });
    await ctx.scheduler.runAfter(0, internal.plaid.syncItem, { itemId });
  },
});

// ── Manual refresh (user-requested, cooldown-limited) ────────────────────────
// /transactions/refresh asks Plaid to re-poll the institution on demand (no
// per-call fee — included in the Transactions subscription). The fresh data
// lands minutes later via the SYNC_UPDATES_AVAILABLE webhook → syncItem; we
// also sync immediately to surface anything Plaid already has cached. The
// cooldown is enforced server-side; clients read nextRefreshAt off
// listConnections to disable the button.

const MANUAL_REFRESH_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

// Atomically check the cooldown and stamp lastManualRefreshAt (stamp-first, so
// two rapid requests can't double-fire the refresh). Returns the previous stamp
// so a failed Plaid call can roll back instead of consuming the window.
export const beginManualRefresh = internalMutation({
  args: { itemId: v.string(), userId: v.string() },
  handler: async (ctx, { itemId, userId }) => {
    const item = await ctx.db
      .query("plaidItems")
      .withIndex("by_itemId", (q) => q.eq("itemId", itemId))
      .unique();
    if (!item || item.userId !== userId) throw new Error("Connection not found");
    const now = Date.now();
    const prev = item.lastManualRefreshAt;
    if (prev && now < prev + MANUAL_REFRESH_COOLDOWN_MS) {
      const mins = Math.ceil((prev + MANUAL_REFRESH_COOLDOWN_MS - now) / 60000);
      throw new Error(`Refresh available again in ${mins} min`);
    }
    await ctx.db.patch(item._id, { lastManualRefreshAt: now });
    return { accessToken: item.accessToken, prevRefreshAt: prev ?? null };
  },
});

// Restore/clear the cooldown stamp (rollback when the Plaid call fails).
export const setManualRefreshAt = internalMutation({
  args: { itemId: v.string(), value: v.optional(v.number()) },
  handler: async (ctx, { itemId, value }) => {
    const item = await ctx.db
      .query("plaidItems")
      .withIndex("by_itemId", (q) => q.eq("itemId", itemId))
      .unique();
    if (item) await ctx.db.patch(item._id, { lastManualRefreshAt: value });
  },
});

export const refreshConnection = action({
  args: { itemId: v.string() },
  handler: async (ctx, { itemId }): Promise<void> => {
    const userId = await requireUserId(ctx);
    const { accessToken, prevRefreshAt } = await ctx.runMutation(
      internal.plaid.beginManualRefresh,
      { itemId, userId },
    );
    try {
      await plaidRequest("/transactions/refresh", {
        access_token: accessToken,
      });
    } catch (e) {
      await ctx.runMutation(internal.plaid.setManualRefreshAt, {
        itemId,
        value: prevRefreshAt ?? undefined,
      });
      throw e;
    }
    console.log(`[plaid refresh] item=${itemId} requested`);
    await ctx.scheduler.runAfter(0, internal.plaid.syncItem, { itemId });
  },
});

// ── Read: connected institutions + accounts (never returns accessToken) ───────

export const listConnections = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];

    const items = await ctx.db
      .query("plaidItems")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(50);

    const cards = await ctx.db
      .query("userCards")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(200);
    // Display name: proper catalog name ("Chase Sapphire Preferred®") over the
    // raw cardKey; a user nickname wins over both.
    const cardName = new Map<Id<"userCards">, string>();
    for (const c of cards) {
      const detail = await ctx.db
        .query("cardDetails")
        .withIndex("by_cardKey", (q) => q.eq("cardKey", c.cardKey))
        .unique();
      cardName.set(c._id, c.nickname ?? detail?.cardName ?? c.cardKey);
    }

    return await Promise.all(
      items.map(async (item) => {
        const accounts = await ctx.db
          .query("plaidAccounts")
          .withIndex("by_itemId", (q) => q.eq("itemId", item.itemId))
          .take(50);
        return {
          itemId: item.itemId,
          institutionName: item.institutionName ?? "Bank",
          status: item.status,
          lastSyncedAt: item.lastSyncedAt ?? null,
          // When the next manual refresh unlocks (null ⇒ available now). The
          // cooldown constant stays server-side; clients just compare to now.
          nextRefreshAt: item.lastManualRefreshAt
            ? item.lastManualRefreshAt + MANUAL_REFRESH_COOLDOWN_MS
            : null,
          connectedAt: item._creationTime,
          accounts: accounts.map((a) => ({
            accountId: a.accountId,
            mask: a.mask ?? null,
            // Prefer the descriptive official name when the plain name is generic
            // (Chase returns "CREDIT CARD" for every card; the product is in
            // officialName, e.g. "Ultimate Rewards®"). Lets the user tell
            // duplicate accounts apart and map each one correctly.
            name:
              a.officialName && a.officialName !== a.name
                ? a.officialName
                : (a.name ?? a.officialName ?? "Account"),
            subtype: a.subtype ?? null,
            userCardId: a.userCardId ?? null,
            linkedCardName: a.userCardId
              ? (cardName.get(a.userCardId) ?? null)
              : null,
          })),
        };
      }),
    );
  },
});
