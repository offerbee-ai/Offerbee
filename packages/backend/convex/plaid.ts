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
  isCreditLabeled,
  isStatementCreditFor,
  matchBenefitToTransaction,
} from "./plaidMatch";
import { llmClassify } from "./plaidLlm";
import { deriveDetected, type DetectedAccount } from "./plaidDetect";
import { POPULAR_CARD_KEYS } from "./catalog";
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
async function ensureAutoUsage(
  ctx: MutationCtx,
  txn: Doc<"plaidTransactions">,
  benefit: Doc<"userBenefits">,
) {
  const pk = periodKey(benefit.cycle, txn.date); // attribute to the txn's period
  const amt = Math.abs(txn.amount); // credit postings are negative; log magnitude
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
  if (
    txn.matchStatus === "confirmed" ||
    txn.matchStatus === "dismissed" ||
    txn.matchStatus === "suggested"
  )
    return;

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

  const txnName = `${txn.merchantName ?? ""} ${txn.name ?? ""}`;

  // Refund (negative): only a credit-labeled posting cleanly matched to a
  // curated benefit is authoritative usage. Ambiguous → candidate (LLM decides).
  if (txn.amount < 0) {
    if (!isCreditLabeled(txnName)) {
      await removeAutoUsage(ctx, txn.transactionId);
      await set("none", undefined);
      return;
    }
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

  // Purchase (positive): a plausible benefit relation makes it an LLM candidate.
  const plausible = benefits.find((b) =>
    matchBenefitToTransaction(
      { title: b.title, benefitTitle: b.benefitTitle },
      {
        merchantName: txn.merchantName,
        name: txn.name,
        pfcPrimary: txn.pfcPrimary,
        amount: txn.amount,
      },
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
  amount: v.number(),
  date: v.number(),
  pfcPrimary: v.optional(v.string()),
  pfcDetailed: v.optional(v.string()),
  pending: v.boolean(),
});

// Map a raw Plaid transaction to our normalized, validated shape.
function normalizeTxn(t: any) {
  return {
    transactionId: String(t.transaction_id),
    accountId: String(t.account_id),
    merchantName: t.merchant_name ?? undefined,
    name: t.name ?? undefined,
    amount: typeof t.amount === "number" ? t.amount : Number(t.amount) || 0,
    date: Date.parse(`${t.date}T00:00:00Z`) || Date.now(),
    pfcPrimary: t.personal_finance_category?.primary ?? undefined,
    pfcDetailed: t.personal_finance_category?.detailed ?? undefined,
    pending: Boolean(t.pending),
  };
}

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
        amount: t.amount,
        date: t.date,
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
    let cursor = item.cursor ?? undefined;
    let hasMore = true;
    let guard = 0;
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
      });
      await ctx.runMutation(internal.plaid.applySync, {
        itemId,
        userId: item.userId,
        added: (resp.added ?? []).map(normalizeTxn),
        modified: (resp.modified ?? []).map(normalizeTxn),
        removed: (resp.removed ?? []).map((r) => String(r.transaction_id)),
      });
      cursor = resp.next_cursor;
      hasMore = resp.has_more;
      await ctx.runMutation(internal.plaid.saveCursor, { itemId, cursor });
    }

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
        await ctx.db.patch(txn._id, {
          matchStatus: "suggested",
          matchedBenefitId: benefit._id,
        });
      }
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
    await ensureAutoUsage(ctx, txn, benefit);
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
    return await Promise.all(
      rows.map(async (t) => {
        const benefit = t.matchedBenefitId
          ? await ctx.db.get(t.matchedBenefitId)
          : null;
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
          connectedAt: item._creationTime,
          accounts: accounts.map((a) => ({
            accountId: a.accountId,
            mask: a.mask ?? null,
            name: a.name ?? a.officialName ?? "Account",
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
