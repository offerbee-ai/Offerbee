"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { Panel } from "./controls";

// "Connected accounts" — Plaid Link connect + per-account → wallet-card linking
// (Design/design_handoff_connected_accounts, states 1a–1c). Links let
// transaction sync auto-log the card's credits.

// Institution brand colors are CONTENT, not theme tokens — never remapped.
const INSTITUTION_COLORS: [RegExp, string][] = [
  [/chase/i, "#0E4C96"],
  [/american express|amex/i, "#016FD0"],
  [/bank of america/i, "#E31837"],
  [/citi/i, "#056DAE"],
  [/capital one/i, "#004977"],
  [/wells fargo/i, "#D71E28"],
  [/discover/i, "#FF6000"],
  [/u\.?s\.? bank/i, "#0C2074"],
];
const institutionColor = (name: string) =>
  INSTITUTION_COLORS.find(([re]) => re.test(name))?.[1] ?? "#6F6757";

// Only credit-card accounts are shown (checking/savings filtered out).
const isCreditAccount = (subtype: string | null | undefined) =>
  !subtype || /credit/i.test(subtype);

const connectedOn = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// Compact relative timestamp for the "Updated …" status line.
function timeAgo(ts: number): string {
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

type WalletCard = { userCardId: Id<"userCards">; name: string; cardKey: string };
type CatalogGroup = {
  issuer: string;
  cards: { cardKey: string; cardName: string; owned: boolean }[];
};
type CatalogResult = { cardKey: string; cardName: string; cardIssuer: string };

const PlusIcon = ({ size = 13 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    className="shrink-0"
  >
    <path d="M7 1.5v11M1.5 7h11" />
  </svg>
);

const ChevronsIcon = ({ className }: { className?: string }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`shrink-0 ${className ?? ""}`}
  >
    <path d="M4.5 6 8 2.5 11.5 6M4.5 10 8 13.5 11.5 10" />
  </svg>
);

const CheckIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="shrink-0 text-accent"
  >
    <path d="M3 8.5 6.5 12 13 4.5" />
  </svg>
);

const LinkIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2" />
    <path d="M14 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2" />
  </svg>
);

// The grouped link options — shared by the row popover (1c) and the
// post-connect prompt so both surfaces read identically.
function LinkOptions({
  currentCardId,
  cards,
  linkedTo,
  catalogGroups,
  picking,
  onSetLink,
  onAddLink,
  showNotLinked = true,
}: {
  currentCardId: Id<"userCards"> | null;
  cards: WalletCard[];
  linkedTo: Map<string, string>;
  catalogGroups: CatalogGroup[];
  picking: boolean;
  onSetLink: (userCardId: Id<"userCards"> | null) => void;
  onAddLink: (cardKey: string) => void;
  showNotLinked?: boolean;
}) {
  // Search-any-card: instant local-catalog hits + a debounced live API search
  // (the add-card page's hybrid pattern), so cards outside the popular list are
  // linkable here without a detour through the wallet.
  const [term, setTerm] = useState("");
  const [apiResults, setApiResults] = useState<CatalogResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const searchCards = useAction(api.rapidapi.searchCards);
  const reqId = useRef(0);

  const trimmed = term.trim();
  const searchActive = trimmed.length >= 2;
  const localResults = useQuery(
    api.catalog.searchCatalogLocal,
    searchActive ? { term: trimmed } : "skip",
  );

  useEffect(() => {
    if (trimmed.length < 2) {
      /* eslint-disable react-hooks/set-state-in-effect -- reset debounced search state when the query is cleared */
      setApiResults([]);
      setSearched(false);
      setSearching(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    const id = ++reqId.current;
    setApiResults([]);
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const r = await searchCards({ term: trimmed });
        if (id === reqId.current) {
          setApiResults(r);
          setSearched(true);
        }
      } catch {
        if (id === reqId.current) setSearched(true);
      } finally {
        if (id === reqId.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [trimmed, searchCards]);

  // Owned cards are pickable in the wallet section above — drop them from
  // search results instead of offering a second "add" path to the same card.
  const ownedKeys = useMemo(
    () => new Set(cards.map((c) => c.cardKey)),
    [cards],
  );
  const results = useMemo(() => {
    const map = new Map<string, CatalogResult>();
    for (const r of localResults ?? []) map.set(r.cardKey, r);
    for (const r of apiResults) map.set(r.cardKey, r);
    return Array.from(map.values()).filter((r) => !ownedKeys.has(r.cardKey));
  }, [localResults, apiResults, ownedKeys]);

  return (
    <>
      {showNotLinked && (
        <button
          type="button"
          disabled={picking}
          onClick={() => onSetLink(null)}
          className={`flex w-full items-center gap-[9px] rounded-[9px] px-[10px] py-[9px] text-left hover:bg-accent-soft/50 disabled:opacity-50 ${!currentCardId ? "bg-accent-soft/50" : ""}`}
        >
          {!currentCardId ? <CheckIcon /> : <span className="w-[14px] shrink-0" />}
          <span className="text-[13.5px] font-semibold text-ink">Not linked</span>
        </button>
      )}

      {cards.length > 0 && (
        <>
          <div className="px-[10px] pb-[5px] pt-3 font-mono text-[10px] font-medium uppercase tracking-[0.07em] text-tertiary">
            Your wallet
          </div>
          {cards.map((c) => {
            const current = currentCardId === c.userCardId;
            const elsewhere = !current && linkedTo.has(c.userCardId);
            return (
              <button
                key={c.userCardId}
                type="button"
                disabled={picking || elsewhere}
                onClick={() => onSetLink(c.userCardId)}
                className={`flex w-full items-center justify-between gap-[9px] rounded-[9px] py-[9px] pr-[10px] text-left ${
                  elsewhere
                    ? "cursor-default pl-[33px] text-tertiary"
                    : current
                      ? "bg-accent-soft/50 pl-[10px]"
                      : "pl-[33px] hover:bg-accent-soft/50"
                } disabled:opacity-70`}
              >
                <span className="flex min-w-0 items-center gap-[9px]">
                  {current && <CheckIcon />}
                  <span
                    className={`truncate text-[13.5px] font-medium ${elsewhere ? "text-tertiary" : "text-ink"}`}
                  >
                    {c.name}
                  </span>
                </span>
                {elsewhere && (
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.05em] text-tertiary">
                    Linked to ····{linkedTo.get(c.userCardId)}
                  </span>
                )}
              </button>
            );
          })}
        </>
      )}

      {/* Add new: search the full catalog, or browse the issuer's popular
          cards while the input is empty. */}
      <div className="mx-1 my-[6px] h-px bg-separator" />
      <div className="px-1 pb-[2px] pt-[6px]">
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search any card…"
          className="w-full rounded-[9px] border border-border bg-surface px-[10px] py-[7px] text-[13px] text-ink outline-none placeholder:text-tertiary focus:border-accent"
        />
      </div>

      {searchActive ? (
        <>
          <div className="px-[10px] pb-[5px] pt-[6px] font-mono text-[10px] font-medium uppercase tracking-[0.07em] text-tertiary">
            Add new — search
          </div>
          {results.map((c) => (
            <button
              key={c.cardKey}
              type="button"
              disabled={picking}
              onClick={() => onAddLink(c.cardKey)}
              className="flex w-full items-center gap-[9px] rounded-[9px] px-[10px] py-[9px] text-left hover:bg-accent-soft/50 disabled:opacity-50"
            >
              <span className="text-accent">
                <PlusIcon size={14} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold text-ink">
                  {c.cardName}
                </span>
                <span className="mt-px block truncate text-[12px] text-secondary">
                  {c.cardIssuer} · adds this card to your wallet
                </span>
              </span>
            </button>
          ))}
          {results.length === 0 && (
            <div className="px-[10px] py-[9px] text-[13px] text-secondary">
              {searching || localResults === undefined
                ? "Searching…"
                : searched
                  ? "No matches — try a different card name."
                  : "Searching…"}
            </div>
          )}
        </>
      ) : (
        catalogGroups.map((g, i) => {
          const notOwned = g.cards.filter((c) => !c.owned);
          if (notOwned.length === 0) return null;
          return (
            <div key={g.issuer}>
              {i > 0 && <div className="mx-1 my-[6px] h-px bg-separator" />}
              <div className="px-[10px] pb-[5px] pt-[6px] font-mono text-[10px] font-medium uppercase tracking-[0.07em] text-tertiary">
                Add new — {g.issuer}
              </div>
              {notOwned.map((c) => (
                <button
                  key={c.cardKey}
                  type="button"
                  disabled={picking}
                  onClick={() => onAddLink(c.cardKey)}
                  className="flex w-full items-center gap-[9px] rounded-[9px] px-[10px] py-[9px] text-left hover:bg-accent-soft/50 disabled:opacity-50"
                >
                  <span className="text-accent">
                    <PlusIcon size={14} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">
                      {c.cardName}
                    </span>
                    <span className="mt-px block text-[12px] text-secondary">
                      Adds this card to your wallet
                    </span>
                  </span>
                </button>
              ))}
            </div>
          );
        })
      )}
    </>
  );
}

// An account the connect flow couldn't auto-resolve to a catalog card (e.g.
// Chase names every UR card "Ultimate Rewards®") — prompted right after Link.
type PendingAccount = {
  accountId: string;
  mask?: string;
  institutionName?: string;
};

export function PlaidConnect() {
  const configured = useQuery(api.plaid.plaidConfigured);
  const connections = useQuery(api.plaid.listConnections);
  const wallet = useQuery(api.benefits.listMyCredits);
  const popular = useQuery(api.catalog.popularCards);
  const createLinkToken = useAction(api.plaid.createLinkToken);
  const createUpdateLinkToken = useAction(api.plaid.createUpdateLinkToken);
  const exchange = useAction(api.plaid.exchangePublicToken);
  const reactivate = useMutation(api.plaid.reactivateItem);
  const linkAccount = useMutation(api.plaid.linkAccountToCard);
  const linkCatalogCard = useAction(api.plaid.linkAccountToCatalogCard);
  const removeConnection = useAction(api.plaid.removeConnection);
  const refresh = useAction(api.plaid.refreshConnection);

  const cards = wallet?.cards ?? [];
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // accountId whose link popover is open — one at a time; siblings dim.
  const [openFor, setOpenFor] = useState<string | null>(null);
  // Unresolved credit accounts from the last connect, prompted one at a time.
  const [pickQueue, setPickQueue] = useState<PendingAccount[]>([]);
  const [confirmDisconnect, setConfirmDisconnect] = useState<{
    itemId: string;
    name: string;
    linkedCount: number;
  } | null>(null);
  // Set while re-authenticating an existing item (Link update mode); null = a
  // fresh connect. onSuccess branches on this.
  const [reauthItemId, setReauthItemId] = useState<string | null>(null);
  // Per-connection manual refresh + cooldown. `now` re-renders once when the
  // earliest cooldown expires so the button re-enables without a reload.
  const [refreshingItem, setRefreshingItem] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const openedFor = useRef<string | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cooldowns = (connections ?? [])
      .map((c) => c.nextRefreshAt)
      .filter((t): t is number => t != null && t > now);
    if (cooldowns.length === 0) return;
    const t = setTimeout(
      () => setNow(Date.now()),
      Math.min(...cooldowns) - now + 1000,
    );
    return () => clearTimeout(t);
  }, [connections, now]);

  // Close the popover on outside click.
  useEffect(() => {
    if (!openFor) return;
    const onDown = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) setOpenFor(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openFor]);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: any) => {
      setBusy(true);
      setError(null);
      try {
        if (reauthItemId) {
          // Update mode: no public-token exchange — just mark the item healthy.
          await reactivate({ itemId: reauthItemId });
        } else {
          const institutionName = metadata?.institution?.name as
            | string
            | undefined;
          const res = await exchange({
            publicToken,
            institutionId: metadata?.institution?.institution_id,
            institutionName,
          });
          // Banks like Chase report a rewards-program name instead of the card
          // product, so auto-linking can fail — prompt per unresolved account.
          setPickQueue(
            res.accounts
              .filter((a) => !a.linked && isCreditAccount(a.subtype))
              .map((a) => ({
                accountId: a.accountId,
                mask: a.mask,
                institutionName,
              })),
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to link account");
      } finally {
        setBusy(false);
        setLinkToken(null);
        setReauthItemId(null);
        openedFor.current = null;
      }
    },
    [exchange, reactivate, reauthItemId],
  );

  // User closed Link without finishing — reset so the button leaves "Connecting…".
  const onExit = useCallback(() => {
    setBusy(false);
    setLinkToken(null);
    setReauthItemId(null);
    openedFor.current = null;
  }, []);

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess, onExit });

  // usePlaidLink needs the token up front, so fetch it, then auto-open once ready.
  useEffect(() => {
    if (linkToken && ready && openedFor.current !== linkToken) {
      openedFor.current = linkToken;
      open();
    }
  }, [linkToken, ready, open]);

  const startConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const { linkToken } = await createLinkToken({});
      setLinkToken(linkToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start Plaid");
      setBusy(false);
    }
  };

  // Re-authenticate an existing connection (Plaid Link update mode).
  const startReauth = async (itemId: string) => {
    setBusy(true);
    setError(null);
    setReauthItemId(itemId);
    try {
      const { linkToken } = await createUpdateLinkToken({ itemId });
      setLinkToken(linkToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start reconnect");
      setBusy(false);
      setReauthItemId(null);
    }
  };

  const doRefresh = async (itemId: string) => {
    setRefreshingItem(itemId);
    setError(null);
    try {
      await refresh({ itemId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshingItem(null);
    }
  };

  const setLink = async (
    accountId: string,
    userCardId: Id<"userCards"> | null,
  ) => {
    setPicking(true);
    try {
      await linkAccount({ accountId, userCardId });
      setOpenFor(null);
      setPickQueue((q) => q.filter((p) => p.accountId !== accountId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link card");
    } finally {
      setPicking(false);
    }
  };

  const addAndLink = async (accountId: string, cardKey: string) => {
    setPicking(true);
    try {
      await linkCatalogCard({ accountId, cardKey });
      setOpenFor(null);
      setPickQueue((q) => q.filter((p) => p.accountId !== accountId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link card");
    } finally {
      setPicking(false);
    }
  };

  // "Add new" scoping: the connected institution's issuer only; an institution
  // missing from the catalog falls back to the full list.
  const catalogGroupsFor = (institutionName?: string): CatalogGroup[] => {
    const groups = popular ?? [];
    if (!institutionName) return groups;
    const inst = institutionName.toLowerCase();
    const matched = groups.filter((g) =>
      inst.includes(g.issuer.toLowerCase()),
    );
    return matched.length > 0 ? matched : groups;
  };

  if (configured === false)
    return (
      <Panel className="p-5">
        <p className="text-[13.5px] text-secondary">
          Bank connections aren&apos;t configured yet. Set the Plaid API keys to
          enable automatic credit tracking.
        </p>
      </Panel>
    );

  if (connections === undefined) return null;

  // One card ↔ one account: which wallet card is linked to which account mask,
  // across every connection — used to disable already-linked cards in pickers.
  const linkedTo = new Map<string, string>();
  for (const conn of connections)
    for (const a of conn.accounts)
      if (a.userCardId) linkedTo.set(a.userCardId, a.mask ?? "");

  const pending = pickQueue[0];

  const connectButton = (label = "Connect a card") => (
    <button
      type="button"
      onClick={startConnect}
      disabled={busy}
      className="inline-flex items-center gap-[7px] rounded-[11px] bg-accent px-[18px] py-[10px] text-[14px] font-semibold text-on-accent transition-colors hover:bg-accent-strong disabled:opacity-50"
    >
      <PlusIcon />
      {busy ? "Connecting…" : label}
    </button>
  );

  // Post-connect link prompt — same option list as the row popover (1c),
  // presented as a dialog for each account the connect couldn't resolve.
  const pickPrompt = pending && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Skip for now"
        onClick={() => setPickQueue((q) => q.slice(1))}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative flex max-h-[85vh] min-h-[440px] w-full max-w-[480px] flex-col overflow-hidden rounded-[16px] border border-border bg-surface shadow-[0_16px_48px_rgba(33,29,22,.18)]">
        <div className="border-b border-separator px-6 pb-4 pt-5 text-center">
          <h3 className="font-display text-[19px] font-semibold text-ink">
            Link credit card{pending.mask ? ` ····${pending.mask}` : ""}
          </h3>
          <p className="mt-1 text-[13px] text-secondary">
            {pending.institutionName ?? "Your bank"} · transactions will
            auto-track this card&apos;s credits
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <LinkOptions
            currentCardId={null}
            cards={cards}
            linkedTo={linkedTo}
            catalogGroups={catalogGroupsFor(pending.institutionName)}
            picking={picking}
            onSetLink={(id) => void setLink(pending.accountId, id)}
            onAddLink={(key) => void addAndLink(pending.accountId, key)}
            showNotLinked={false}
          />
        </div>
        <div className="border-t border-separator p-3">
          <button
            type="button"
            disabled={picking}
            onClick={() => setPickQueue((q) => q.slice(1))}
            className="w-full rounded-[10px] px-3 py-2 text-[13.5px] font-semibold text-secondary transition-colors hover:bg-accent-soft/50 disabled:opacity-50"
          >
            Not sure — skip for now
          </button>
        </div>
      </div>
    </div>
  );

  // ── 1a · Empty state ────────────────────────────────────────────────────────
  if (connections.length === 0)
    return (
      <>
        <Panel className="flex flex-col items-center px-8 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <LinkIcon />
          </div>
          <h3 className="mt-4 font-display text-[21px] font-semibold tracking-[-0.01em] text-ink">
            Nothing connected yet
          </h3>
          <p className="mt-2 max-w-[380px] text-[14px] leading-[1.55] text-secondary">
            Connect a card account and OfferBee will auto-track its statement
            credits from your transactions — no more marking them by hand.
          </p>
          <div className="mt-[22px]">{connectButton()}</div>
          {error && (
            <p className="mt-3 text-[13px] font-medium text-alert">{error}</p>
          )}
          <p className="mt-4 font-mono text-[10px] font-medium uppercase tracking-[0.07em] text-tertiary">
            Read-only access · Disconnect anytime
          </p>
        </Panel>
        {pickPrompt}
      </>
    );

  // ── 1b/1c · Connected ───────────────────────────────────────────────────────
  return (
    <Panel className="overflow-visible">
      {connections.map((conn) => {
        const creditAccounts = conn.accounts.filter((a) =>
          isCreditAccount(a.subtype),
        );
        const notLinked = creditAccounts.filter((a) => !a.userCardId).length;
        const linkedCount = creditAccounts.length - notLinked;
        const catalogGroups = catalogGroupsFor(conn.institutionName);

        return (
          <div key={conn.itemId} className="border-t border-separator first:border-t-0">
            {/* Institution header */}
            <div className="flex items-center gap-[14px] border-b border-separator px-6 py-[18px]">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] font-display text-[19px] font-semibold text-white"
                style={{ background: institutionColor(conn.institutionName) }}
              >
                {conn.institutionName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-semibold text-ink">
                  {conn.institutionName}
                </div>
                <div className="mt-px text-[12.5px] text-secondary">
                  {conn.status === "login_required" ? (
                    <span className="text-alert">Reconnect needed</span>
                  ) : conn.status === "error" ? (
                    <span className="text-alert">Connection error</span>
                  ) : (
                    `${creditAccounts.length} account${creditAccounts.length === 1 ? "" : "s"} · connected ${connectedOn(conn.connectedAt)}${
                      conn.lastSyncedAt
                        ? ` · updated ${timeAgo(conn.lastSyncedAt)}`
                        : ""
                    }`
                  )}
                  {conn.status === "active" && notLinked > 0 && (
                    <>
                      {" · "}
                      <span className="text-tertiary">
                        {notLinked} not linked
                      </span>
                    </>
                  )}
                </div>
              </div>
              {conn.status === "active" ? (
                <button
                  type="button"
                  onClick={() => void doRefresh(conn.itemId)}
                  disabled={
                    refreshingItem === conn.itemId ||
                    (conn.nextRefreshAt != null && conn.nextRefreshAt > now)
                  }
                  title={
                    conn.nextRefreshAt != null && conn.nextRefreshAt > now
                      ? `Next refresh available at ${new Date(conn.nextRefreshAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                      : "Check for new transactions now"
                  }
                  className="shrink-0 rounded-[9px] border border-border px-3 py-[7px] text-[12.5px] font-semibold text-ink transition-colors hover:border-accent disabled:opacity-45"
                >
                  {refreshingItem === conn.itemId ? "Refreshing…" : "Refresh"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void startReauth(conn.itemId)}
                  disabled={busy}
                  className="shrink-0 rounded-[9px] bg-accent px-3 py-[7px] text-[12.5px] font-semibold text-on-accent transition-colors hover:bg-accent-strong disabled:opacity-50"
                >
                  Reconnect
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  setConfirmDisconnect({
                    itemId: conn.itemId,
                    name: conn.institutionName,
                    linkedCount,
                  })
                }
                className="shrink-0 text-[13px] font-semibold text-alert hover:underline"
              >
                Disconnect
              </button>
            </div>

            {/* Account rows */}
            {creditAccounts.map((acct) => {
              const isOpen = openFor === acct.accountId;
              const dimmed = openFor !== null && !isOpen;
              return (
                <div
                  key={acct.accountId}
                  className="flex flex-col gap-2 border-b border-separator px-6 py-[13px] last:border-b-0 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div
                    className={`flex min-w-0 flex-1 items-baseline gap-2 transition-opacity ${dimmed ? "opacity-55" : ""}`}
                  >
                    <span className="text-[14.5px] font-semibold text-ink">
                      Credit card
                    </span>
                    {acct.mask && (
                      <span className="font-mono text-[13px] font-medium text-tertiary">
                        ····{acct.mask}
                      </span>
                    )}
                  </div>

                  {/* Link selector + popover */}
                  <div
                    className={`relative w-full shrink-0 transition-opacity sm:w-[280px] ${dimmed ? "opacity-55" : ""}`}
                    ref={isOpen ? popoverRef : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFor(isOpen ? null : acct.accountId)}
                      className={`flex w-full items-center justify-between gap-[10px] rounded-[10px] border px-3 py-[9px] text-left ${
                        isOpen
                          ? "border-accent bg-surface ring-[3px] ring-accent-soft"
                          : acct.userCardId
                            ? "border-border bg-surface hover:border-tertiary/50"
                            : "border-warning/45 bg-warning-soft"
                      }`}
                    >
                      <span
                        className={`truncate text-[13.5px] font-medium ${
                          isOpen
                            ? "text-tertiary"
                            : acct.userCardId
                              ? "text-ink"
                              : "text-warning"
                        }`}
                      >
                        {isOpen
                          ? (acct.linkedCardName ?? "Not linked")
                          : (acct.linkedCardName ??
                            "Not linked — choose a card")}
                      </span>
                      <ChevronsIcon
                        className={
                          acct.userCardId || isOpen
                            ? "text-tertiary"
                            : "text-warning"
                        }
                      />
                    </button>

                    {isOpen && (
                      <div className="absolute right-0 top-[calc(100%+6px)] z-20 max-h-[min(420px,60vh)] w-full overflow-y-auto rounded-[14px] border border-border bg-surface p-[6px] shadow-[0_16px_48px_rgba(33,29,22,.18)] sm:w-[300px]">
                        <LinkOptions
                          currentCardId={acct.userCardId}
                          cards={cards}
                          linkedTo={linkedTo}
                          catalogGroups={catalogGroups}
                          picking={picking}
                          onSetLink={(id) => void setLink(acct.accountId, id)}
                          onAddLink={(key) =>
                            void addAndLink(acct.accountId, key)
                          }
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Footer CTA */}
      <div className="border-t border-separator px-6 pb-[18px] pt-4">
        {connectButton()}
        {error && (
          <p className="mt-2 text-[13px] font-medium text-alert">{error}</p>
        )}
        <p className="mt-[10px] text-[12.5px] text-secondary">
          Link a card so OfferBee can auto-track its statement credits from your
          transactions.
        </p>
      </div>

      {/* Disconnect confirm */}
      {confirmDisconnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cancel"
            onClick={() => setConfirmDisconnect(null)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative w-full max-w-sm rounded-[14px] border border-border bg-surface p-5 shadow-[0_16px_48px_rgba(33,29,22,.18)]">
            <h3 className="font-display text-[17px] font-semibold text-ink">
              Disconnect {confirmDisconnect.name}?
            </h3>
            <p className="mt-2 text-[13.5px] leading-[1.5] text-secondary">
              Auto-tracking stops for {confirmDisconnect.linkedCount} linked
              card{confirmDisconnect.linkedCount === 1 ? "" : "s"}. Your wallet
              cards and history stay.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDisconnect(null)}
                className="rounded-[10px] px-4 py-2 text-[13.5px] font-semibold text-secondary hover:bg-accent-soft/50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void removeConnection({
                    itemId: confirmDisconnect.itemId,
                  });
                  setConfirmDisconnect(null);
                }}
                className="rounded-[10px] bg-alert px-4 py-2 text-[13.5px] font-semibold text-white hover:opacity-90"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {pickPrompt}
    </Panel>
  );
}
