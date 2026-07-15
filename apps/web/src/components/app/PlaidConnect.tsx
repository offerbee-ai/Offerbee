"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { Panel } from "./controls";

// An account Plaid couldn't auto-resolve to a catalog card (e.g. Chase names
// every UR card "Ultimate Rewards®") — queued for the post-connect picker.
type PendingAccount = {
  accountId: string;
  mask?: string;
  name?: string;
  institutionName?: string;
};

// "Connected accounts" — Plaid Link connect + per-account → wallet-card linking.
// Links let transaction sync auto-log the card's credits.
export function PlaidConnect() {
  const configured = useQuery(api.plaid.plaidConfigured);
  const connections = useQuery(api.plaid.listConnections);
  const wallet = useQuery(api.benefits.listMyCredits);
  const popular = useQuery(api.catalog.popularCards);
  const createLinkToken = useAction(api.plaid.createLinkToken);
  const exchange = useAction(api.plaid.exchangePublicToken);
  const linkAccount = useMutation(api.plaid.linkAccountToCard);
  const linkCatalogCard = useAction(api.plaid.linkAccountToCatalogCard);
  const removeConnection = useAction(api.plaid.removeConnection);

  const cards = wallet?.cards ?? [];
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Unresolved credit accounts from the last connect, shown one at a time.
  const [pickQueue, setPickQueue] = useState<PendingAccount[]>([]);
  const [picking, setPicking] = useState(false);
  // Reveal non-institution issuers in the picker (co-brands, catalog gaps).
  const [showAllIssuers, setShowAllIssuers] = useState(false);
  const openedFor = useRef<string | null>(null);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: any) => {
      setBusy(true);
      setError(null);
      try {
        const institutionName = metadata?.institution?.name as
          | string
          | undefined;
        const res = await exchange({
          publicToken,
          institutionId: metadata?.institution?.institution_id,
          institutionName,
        });
        // Banks like Chase report a rewards-program name instead of the card
        // product, so auto-linking can fail — ask the user per account.
        setPickQueue(
          res.accounts
            .filter(
              (a) => !a.linked && (!a.subtype || /credit/i.test(a.subtype)),
            )
            .map((a) => ({
              accountId: a.accountId,
              mask: a.mask,
              name: a.name,
              institutionName,
            })),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to link account");
      } finally {
        setBusy(false);
        setLinkToken(null);
        openedFor.current = null;
      }
    },
    [exchange],
  );

  // User closed Link without finishing — reset so the button leaves "Connecting…".
  const onExit = useCallback(() => {
    setBusy(false);
    setLinkToken(null);
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

  const pending = pickQueue[0];
  const skipPending = () => {
    setShowAllIssuers(false);
    setPickQueue((q) => q.slice(1));
  };
  const pickCatalogCard = async (accountId: string, cardKey: string) => {
    setPicking(true);
    try {
      await linkCatalogCard({ accountId, cardKey });
      setShowAllIssuers(false);
      setPickQueue((q) => q.filter((p) => p.accountId !== accountId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link card");
    } finally {
      setPicking(false);
    }
  };

  // Catalog groups split by whether they belong to the connected institution
  // (e.g. Chase → the Chase group). The picker shows only matched groups by
  // default — the institution is the one name the bank reports reliably.
  const splitIssuerGroups = (institutionName?: string) => {
    const groups = popular ?? [];
    if (!institutionName) return { matched: [], others: groups };
    const inst = institutionName.toLowerCase();
    return {
      matched: groups.filter((g) => inst.includes(g.issuer.toLowerCase())),
      others: groups.filter((g) => !inst.includes(g.issuer.toLowerCase())),
    };
  };

  const feeLabel = (annualFee: number | null) =>
    annualFee == null ? "" : annualFee === 0 ? "No annual fee" : `$${annualFee}/yr`;

  if (configured === false)
    return (
      <Panel className="p-5">
        <p className="text-[13.5px] text-secondary">
          Bank connections aren&apos;t configured yet. Set the Plaid API keys to
          enable automatic credit tracking.
        </p>
      </Panel>
    );

  return (
    <Panel className="overflow-hidden">
      {(connections ?? []).map((conn) => (
        <div key={conn.itemId} className="border-t border-separator p-5 first:border-t-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[14.5px] font-semibold text-ink">
                {conn.institutionName}
              </div>
              <div className="mt-0.5 text-[12.5px] text-secondary">
                {conn.status === "active"
                  ? `${conn.accounts.length} account${conn.accounts.length === 1 ? "" : "s"}`
                  : conn.status === "login_required"
                    ? "Reconnect needed"
                    : "Connection error"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void removeConnection({ itemId: conn.itemId })}
              className="text-[13px] font-semibold text-alert hover:underline"
            >
              Disconnect
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            {conn.accounts.map((acct) => (
              <div
                key={acct.accountId}
                className="flex items-center justify-between gap-3 rounded-[10px] border border-border px-3 py-2"
              >
                <div className="min-w-0 text-[13.5px] text-ink">
                  {acct.name}
                  {acct.mask ? (
                    <span className="text-tertiary"> ····{acct.mask}</span>
                  ) : null}
                </div>
                <select
                  value={acct.userCardId ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    // "new:<cardKey>" adds the catalog card to the wallet
                    // (seeding its credits) and links in one step.
                    if (value.startsWith("new:")) {
                      void pickCatalogCard(acct.accountId, value.slice(4));
                      return;
                    }
                    void linkAccount({
                      accountId: acct.accountId,
                      userCardId: value ? (value as Id<"userCards">) : null,
                    });
                  }}
                  className="rounded-[8px] border border-border bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
                >
                  <option value="">Not linked</option>
                  {cards.length > 0 && (
                    <optgroup label="Your wallet">
                      {cards.map((c) => (
                        <option key={c.userCardId} value={c.userCardId}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {(() => {
                    // Same scoping as the picker: only the connected
                    // institution's issuer group; unmatched → full catalog.
                    const { matched, others } = splitIssuerGroups(
                      conn.institutionName,
                    );
                    const groups = matched.length > 0 ? matched : others;
                    return groups.map((g) => {
                      const notOwned = g.cards.filter((c) => !c.owned);
                      if (notOwned.length === 0) return null;
                      return (
                        <optgroup key={g.issuer} label={`Add new — ${g.issuer}`}>
                          {notOwned.map((c) => (
                            <option key={c.cardKey} value={`new:${c.cardKey}`}>
                              {c.cardName}
                            </option>
                          ))}
                        </optgroup>
                      );
                    });
                  })()}
                </select>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="border-t border-separator p-5 first:border-t-0">
        <button
          type="button"
          onClick={startConnect}
          disabled={busy}
          className="rounded-[11px] bg-accent px-4 py-2 text-[14px] font-semibold text-on-accent transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          {busy ? "Connecting…" : "+ Connect a card"}
        </button>
        {error && <p className="mt-2 text-[13px] font-medium text-alert">{error}</p>}
        <p className="mt-2 text-[12.5px] text-secondary">
          Link a card so OfferBee can auto-track its statement credits from your
          transactions.
        </p>
      </div>

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Skip for now"
            onClick={skipPending}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-[14px] border border-border bg-surface shadow-xl">
            <div className="border-b border-separator p-5">
              <h3 className="text-[15.5px] font-semibold text-ink">
                Which card is{" "}
                {pending.institutionName ?? pending.name ?? "this account"}
                {pending.mask ? ` ····${pending.mask}` : ""}?
              </h3>
              <p className="mt-1 text-[12.5px] text-secondary">
                {pending.institutionName ?? "The bank"} didn&apos;t report which
                card this account is. Pick it to track its credits — you can
                change this anytime.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {(() => {
                // Only the connected institution's cards by default; the rest
                // stay behind "show all" (co-brands, cards missing from the
                // institution's catalog group). No match → show everything.
                const { matched, others } = splitIssuerGroups(
                  pending.institutionName,
                );
                const groups =
                  matched.length === 0 || showAllIssuers
                    ? [...matched, ...others]
                    : matched;
                const hidden = matched.length > 0 && !showAllIssuers;
                return (
                  <>
                    {groups.map((g) => (
                      <div key={g.issuer} className="mb-2">
                        <div className="px-2 py-1 text-[11.5px] font-semibold uppercase tracking-wide text-tertiary">
                          {g.issuer}
                        </div>
                        {g.cards.map((c) => (
                          <button
                            key={c.cardKey}
                            type="button"
                            disabled={picking}
                            onClick={() =>
                              void pickCatalogCard(pending.accountId, c.cardKey)
                            }
                            className="flex w-full items-center justify-between gap-3 rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-accent/10 disabled:opacity-50"
                          >
                            <span className="text-[13.5px] text-ink">
                              {c.cardName}
                              {c.owned ? (
                                <span className="ml-1.5 text-[11.5px] text-tertiary">
                                  in wallet
                                </span>
                              ) : null}
                            </span>
                            <span className="shrink-0 text-[12px] text-secondary">
                              {feeLabel(c.annualFee)}
                            </span>
                          </button>
                        ))}
                      </div>
                    ))}
                    {hidden && (
                      <button
                        type="button"
                        onClick={() => setShowAllIssuers(true)}
                        className="w-full rounded-[10px] px-2 py-2 text-left text-[13px] font-semibold text-accent transition-colors hover:bg-accent/10"
                      >
                        My card isn&apos;t listed — show other issuers
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
            <div className="border-t border-separator p-3">
              <button
                type="button"
                onClick={skipPending}
                disabled={picking}
                className="w-full rounded-[10px] px-3 py-2 text-[13.5px] font-semibold text-secondary transition-colors hover:bg-accent/10 disabled:opacity-50"
              >
                Not sure — skip for now
              </button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
