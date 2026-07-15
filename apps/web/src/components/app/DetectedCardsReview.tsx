"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Panel } from "./controls";
import {
  LinkOptions,
  type WalletCard,
  type CatalogGroup,
} from "./PlaidConnect";
import type { DetectResult } from "./usePlaidCardLink";

// Post-connect review — "We found your cards"
// (Design/design_handoff_card_add, states 3a/3b). Every successful Plaid
// connect (onboarding or in-app) lands here; nothing is added to the wallet
// or linked until the user confirms — no silent auto-add.

// Institution brand colors are CONTENT, not theme tokens. Duplicated from
// PlaidConnect's (unexported) INSTITUTION_COLORS map since this review card
// also shows an institution monogram.
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

const CheckGlyph = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

type RowState = { checked: boolean; cardKey: string | null };

function initialRows(
  accounts: DetectResult["accounts"],
): Record<string, RowState> {
  const rows: Record<string, RowState> = {};
  for (const a of accounts) {
    rows[a.accountId] = {
      checked: a.resolvedCardKey !== null,
      cardKey: a.resolvedCardKey,
    };
  }
  return rows;
}

export function DetectedCardsReview({
  result,
  onDone,
}: {
  result: DetectResult;
  onDone: () => void;
}) {
  const wallet = useQuery(api.benefits.listMyCredits);
  const connections = useQuery(api.plaid.listConnections);
  const popular = useQuery(api.catalog.popularCards);
  const confirmDetectedCards = useAction(api.plaid.confirmDetectedCards);

  // `result` is stable for the lifetime of this component (parents mount a
  // fresh instance per connect), so seed once from props.
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    initialRows(result.accounts),
  );
  // accountId whose link popover is open — one at a time, like PlaidConnect.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Close the popover on outside click.
  useEffect(() => {
    if (!openFor) return;
    const onDown = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) setOpenFor(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openFor]);

  const cards = useMemo(() => wallet?.cards ?? [], [wallet]);

  // One card ↔ one account across existing connections — same derivation
  // PlaidConnect uses — so wallet cards already linked elsewhere show disabled.
  const linkedTo = useMemo(() => {
    const map = new Map<string, string>();
    for (const conn of connections ?? [])
      for (const a of conn.accounts)
        if (a.userCardId) map.set(a.userCardId, a.mask ?? "");
    return map;
  }, [connections]);

  // "Add new" scoping: the connected institution's issuer only, falling back
  // to the full list — same logic as PlaidConnect's catalogGroupsFor.
  const catalogGroups = useMemo((): CatalogGroup[] => {
    const groups = popular ?? [];
    const institutionName = result.institutionName;
    if (!institutionName) return groups;
    const inst = institutionName.toLowerCase();
    const matched = groups.filter((g) => inst.includes(g.issuer.toLowerCase()));
    return matched.length > 0 ? matched : groups;
  }, [popular, result.institutionName]);

  // cardKey → display name for rows: catalog name first, wallet name (which
  // may carry a user nickname) wins when the card is already owned.
  const nameForCardKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of popular ?? [])
      for (const c of g.cards) map.set(c.cardKey, c.cardName);
    for (const c of cards) map.set(c.cardKey, c.name);
    return map;
  }, [popular, cards]);

  const setRowCardKey = (accountId: string, cardKey: string) => {
    setRows((prev) => ({ ...prev, [accountId]: { checked: true, cardKey } }));
    setOpenFor(null);
  };

  const toggleChecked = (accountId: string) => {
    setRows((prev) => {
      const row = prev[accountId];
      if (!row?.cardKey) return prev; // disabled until the row has a cardKey
      return { ...prev, [accountId]: { ...row, checked: !row.checked } };
    });
  };

  const selections = Object.entries(rows)
    .filter(([, r]) => r.checked && r.cardKey)
    .map(([accountId, r]) => ({ accountId, cardKey: r.cardKey as string }));

  const confirm = async () => {
    setConfirming(true);
    setError(null);
    try {
      await confirmDetectedCards({ itemId: result.itemId, selections });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add cards");
      setConfirming(false);
    }
  };

  const institutionName = result.institutionName ?? "Your bank";
  const count = result.accounts.length;

  // The grouped popover used to resolve an ambiguous row — identical to the
  // one PlaidConnect's account rows open, minus "Not linked" (every row here
  // needs a card).
  const picker = (
    accountId: string,
    currentCardId: WalletCard["userCardId"] | null,
  ) => (
    <div
      ref={popoverRef}
      className="absolute right-0 top-[calc(100%+6px)] z-20 max-h-[min(420px,60vh)] w-[300px] overflow-y-auto rounded-[14px] border border-border bg-surface p-[6px] shadow-[0_16px_48px_rgba(33,29,22,.18)]"
    >
      <LinkOptions
        currentCardId={currentCardId}
        cards={cards}
        linkedTo={linkedTo}
        catalogGroups={catalogGroups}
        picking={false}
        onSetLink={(userCardId) => {
          const card = cards.find((c) => c.userCardId === userCardId);
          if (card) setRowCardKey(accountId, card.cardKey);
        }}
        onAddLink={(cardKey) => setRowCardKey(accountId, cardKey)}
        showNotLinked={false}
      />
    </div>
  );

  return (
    <Panel className="overflow-visible p-8">
      <h2 className="font-display text-[24px] font-semibold tracking-[-0.01em] text-ink">
        We found your cards
      </h2>
      <p className="mt-[6px] text-[14px] text-secondary">
        Confirm what goes in your wallet — nothing is added without you.
      </p>

      <div className="mt-5 overflow-visible rounded-[18px] border border-border bg-surface">
        <div className="flex items-center gap-[14px] border-b border-separator px-5 py-4">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] font-display text-[17px] font-semibold text-white"
            style={{ background: institutionColor(institutionName) }}
          >
            {institutionName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-ink">
              {institutionName}
            </div>
            <div className="text-[12.5px] text-secondary">
              {count} credit card{count === 1 ? "" : "s"} found
            </div>
          </div>
        </div>

        {result.accounts.map((acct) => {
          const row = rows[acct.accountId] ?? { checked: false, cardKey: null };
          const ambiguous = acct.resolvedCardKey === null;
          const isOpen = openFor === acct.accountId;

          // Unresolved — the bank didn't say which card this is.
          if (ambiguous && !row.cardKey) {
            return (
              <div
                key={acct.accountId}
                className="relative mx-4 my-3 flex items-center gap-[13px] rounded-[12px] border border-warning/45 bg-warning-soft px-[14px] py-3"
              >
                <span className="h-[22px] w-[22px] shrink-0 rounded-full border-[1.5px] border-warning/45" />
                <span className="flex h-6 w-9 shrink-0 items-center justify-center rounded-[4px] border-[1.5px] border-dashed border-warning/45 text-[13px] font-semibold text-warning">
                  ?
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[14.5px] font-semibold text-warning">
                      {acct.officialName ?? acct.name ?? "Card"}
                    </span>
                    {acct.mask && (
                      <span className="font-mono text-[12.5px] text-warning">
                        ····{acct.mask}
                      </span>
                    )}
                  </div>
                  <div className="mt-px text-[12.5px] text-warning">
                    {institutionName} didn&apos;t say which card this is.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenFor(isOpen ? null : acct.accountId)}
                  className="shrink-0 text-[13px] font-semibold text-warning hover:underline"
                >
                  Choose which card →
                </button>
                {isOpen && picker(acct.accountId, null)}
              </div>
            );
          }

          // Resolved — either matched automatically or picked via the popover.
          const displayName =
            (row.cardKey && nameForCardKey.get(row.cardKey)) ||
            row.cardKey ||
            (acct.officialName ?? acct.name ?? "Card");
          const currentUserCardId =
            (row.cardKey &&
              cards.find((c) => c.cardKey === row.cardKey)?.userCardId) ||
            null;

          return (
            <div
              key={acct.accountId}
              className="flex items-center gap-[13px] border-b border-separator px-5 py-[13px] last:border-b-0"
            >
              <button
                type="button"
                disabled={!row.cardKey}
                onClick={() => toggleChecked(acct.accountId)}
                aria-label={
                  row.checked ? "Exclude this card" : "Include this card"
                }
                className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
                  row.checked
                    ? "bg-accent text-white"
                    : "border-[1.5px] border-border"
                }`}
              >
                {row.checked && <CheckGlyph />}
              </button>
              <span
                className="h-6 w-9 shrink-0 rounded-[4px]"
                style={{ background: institutionColor(institutionName) }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[14.5px] font-semibold text-ink">
                    {displayName}
                  </span>
                  {acct.mask && (
                    <span className="font-mono text-[12.5px] text-tertiary">
                      ····{acct.mask}
                    </span>
                  )}
                </div>
              </div>
              {ambiguous ? (
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setOpenFor(isOpen ? null : acct.accountId)}
                    className="text-[13px] font-semibold text-secondary hover:text-ink hover:underline"
                  >
                    Choose which card →
                  </button>
                  {isOpen && picker(acct.accountId, currentUserCardId)}
                </div>
              ) : (
                <span className="shrink-0 font-mono text-[10px] font-medium uppercase tracking-[0.05em] text-tertiary">
                  Matched
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-[18px] flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={confirming || selections.length === 0}
          onClick={() => void confirm()}
          className="rounded-[11px] bg-accent px-6 py-3 text-[14px] font-semibold text-on-accent transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          {confirming
            ? "Adding…"
            : `Add ${selections.length} card${selections.length === 1 ? "" : "s"}`}
        </button>
        <p className="max-w-[340px] text-[12.5px] leading-[1.45] text-secondary">
          Uncheck anything you don&apos;t want. You can link the rest later in
          Settings.
        </p>
      </div>

      {error && (
        <p className="mt-2 text-[13px] font-medium text-alert">{error}</p>
      )}

      <button
        type="button"
        disabled={confirming}
        onClick={onDone}
        className="mt-4 text-[13.5px] font-semibold text-secondary transition-colors hover:text-ink disabled:opacity-50"
      >
        Skip for now
      </button>
    </Panel>
  );
}
