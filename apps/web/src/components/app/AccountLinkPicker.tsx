"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { cn } from "@/lib/utils";

type Result = { cardKey: string; cardName: string };

// Renders one connected account (name + last-4) and a picker to map it to a card.
// The picker offers the user's wallet cards AND a search over the whole catalog,
// so an account whose card isn't in the wallet yet (e.g. Chase "CREDIT CARD")
// can still be linked — linkAccountToCatalogCard adds + links in one step.
export function AccountLinkPicker({
  account,
  walletCards,
}: {
  account: {
    accountId: string;
    name: string;
    mask: string | null;
    linkedCardName: string | null;
  };
  walletCards: { cardKey: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [apiResults, setApiResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const reqId = useRef(0);

  const trimmed = term.trim();
  const browsing = trimmed.length < 2;

  const linkCatalog = useAction(api.plaid.linkAccountToCatalogCard);
  const unlink = useMutation(api.plaid.linkAccountToCard);
  const searchCards = useAction(api.rapidapi.searchCards);
  const local = useQuery(
    api.catalog.searchCatalogLocal,
    browsing ? "skip" : { term: trimmed },
  );

  // Debounced catalog API search (mirrors the add-card page).
  useEffect(() => {
    if (browsing) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setApiResults([]);
      return;
    }
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const r = await searchCards({ term: trimmed });
        if (id === reqId.current) setApiResults(r);
      } catch {
        /* ignore */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [trimmed, browsing, searchCards]);

  const results = useMemo(() => {
    const m = new Map<string, Result>();
    for (const r of local ?? [])
      m.set(r.cardKey, { cardKey: r.cardKey, cardName: r.cardName });
    for (const r of apiResults)
      m.set(r.cardKey, { cardKey: r.cardKey, cardName: r.cardName });
    return Array.from(m.values()).slice(0, 8);
  }, [local, apiResults]);

  const choose = async (cardKey: string) => {
    setBusy(true);
    try {
      await linkCatalog({ accountId: account.accountId, cardKey });
      setOpen(false);
      setTerm("");
    } catch (e) {
      console.error("link account failed", e);
    } finally {
      setBusy(false);
    }
  };

  const doUnlink = async () => {
    setBusy(true);
    try {
      await unlink({ accountId: account.accountId, userCardId: null });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[10px] border border-border px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 truncate text-[13.5px] text-ink">
          {account.name}
          {account.mask ? (
            <span className="text-tertiary"> ····{account.mask}</span>
          ) : null}
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-[8px] border px-2.5 py-1.5 text-[13px] font-semibold transition-colors",
              account.linkedCardName
                ? "border-border text-ink hover:border-accent"
                : "border-accent text-accent hover:bg-accent-soft",
            )}
          >
            {account.linkedCardName ?? "Link card"}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {walletCards.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {walletCards.map((c) => (
                <button
                  key={c.cardKey}
                  type="button"
                  disabled={busy}
                  onClick={() => choose(c.cardKey)}
                  className="rounded-full border border-border px-2.5 py-1 text-[12.5px] text-ink transition-colors hover:border-accent disabled:opacity-50"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <input
            autoFocus
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search any card (e.g. Sapphire, Freedom)…"
            className="w-full rounded-[8px] border border-border bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
          />
          {results.length > 0 && (
            <div className="flex flex-col gap-0.5">
              {results.map((r) => (
                <button
                  key={r.cardKey}
                  type="button"
                  disabled={busy}
                  onClick={() => choose(r.cardKey)}
                  className="rounded-[8px] px-2.5 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-accent-soft disabled:opacity-50"
                >
                  {r.cardName}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-4 pt-0.5">
            {account.linkedCardName && (
              <button
                type="button"
                onClick={doUnlink}
                disabled={busy}
                className="text-[12.5px] font-semibold text-alert hover:underline disabled:opacity-50"
              >
                Unlink
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTerm("");
              }}
              className="text-[12.5px] font-semibold text-secondary hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
