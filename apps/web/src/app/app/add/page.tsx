"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Button, Card, EmptyState, Spinner } from "@/components/app/ui";
import { cardColor } from "@/components/app/data";

type Result = { cardKey: string; cardName: string; cardIssuer: string };

function CardArt({
  cardKey,
  imageUrl,
  size = 44,
}: {
  cardKey: string;
  imageUrl?: string | null;
  size?: number;
}) {
  if (imageUrl)
    // Plain <img>: the card-image host path rotates (see wallet page).
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={imageUrl}
        alt=""
        style={{ width: size * 1.4, height: size }}
        className="shrink-0 rounded-[6px] border border-border object-cover"
      />
    );
  return (
    <span
      style={{ width: size * 1.4, height: size, background: cardColor(cardKey) }}
      className="shrink-0 rounded-[6px] border border-border"
    />
  );
}

export default function AddCardPage() {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const searchCards = useAction(api.rapidapi.searchCards);
  const addCard = useMutation(api.wallet.addCard);
  const popular = useQuery(api.catalog.popularCards);
  const reqId = useRef(0);

  const trimmed = term.trim();
  const browsing = trimmed.length < 2;

  // Instant, reactive matches from cards already in the catalog — no API call,
  // no debounce. Grows automatically as the debounced action below backfills.
  const localResults = useQuery(
    api.catalog.searchCatalogLocal,
    browsing ? "skip" : { term: trimmed },
  );

  // Show local hits immediately; the API action's authoritative results merge in
  // and add anything the local index didn't have yet (deduped by cardKey).
  const shown = useMemo(() => {
    const map = new Map<string, Result>();
    for (const r of localResults ?? []) map.set(r.cardKey, r);
    for (const r of results) map.set(r.cardKey, r);
    return Array.from(map.values());
  }, [localResults, results]);

  // Debounced live search against the card API's name-search endpoint.
  useEffect(() => {
    const t = term.trim();
    if (t.length < 2) {
      /* eslint-disable react-hooks/set-state-in-effect -- reset debounced search state when the query is cleared */
      setResults([]);
      setSearched(false);
      setSearching(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    const id = ++reqId.current;
    // Drop the previous term's API results so only current-term local hits show
    // until this term's action returns (avoids a cross-term merge flash).
    setResults([]);
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const r = await searchCards({ term: t });
        if (id === reqId.current) {
          setResults(r);
          setSearched(true);
        }
      } catch {
        if (id === reqId.current) {
          setResults([]);
          setSearched(true);
        }
      } finally {
        if (id === reqId.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [term, searchCards]);

  // navigate = jump to wallet after adding (search flow); browse flow stays put
  // and lets the reactive `owned` flag flip to "Added".
  const onAdd = async (cardKey: string, navigate: boolean) => {
    setAdding(cardKey);
    setError(null);
    try {
      await addCard({ cardKey });
      if (navigate) router.push("/app/wallet");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add card");
    } finally {
      setAdding(null);
    }
  };

  return (
    <div>
      <input
        type="search"
        autoFocus
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search by card name (e.g. Sapphire, Gold, Venture)"
        className="w-full rounded-button border border-border bg-surface px-4 py-3 text-[15px] text-ink outline-none placeholder:text-tertiary focus:border-accent"
      />

      {error && (
        <p className="mt-3 text-[13px] font-medium text-alert">{error}</p>
      )}

      {/* Browse curated top cards per bank when not searching. */}
      {browsing ? (
        popular === undefined ? (
          <div className="mt-6 flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-7">
            <p className="text-[13.5px] text-secondary">
              Popular cards by bank — or search above for any other card.
            </p>
            {popular.map((group) => (
              <section key={group.issuer} className="flex flex-col gap-2">
                <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-tertiary">
                  {group.issuer}
                </h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.cards.map((c) => (
                    <Card
                      key={c.cardKey}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <CardArt cardKey={c.cardKey} imageUrl={c.imageUrl} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">
                            {c.cardName}
                          </p>
                          <p className="text-[12.5px] text-secondary">
                            {c.annualFee != null
                              ? c.annualFee > 0
                                ? `$${c.annualFee}/yr`
                                : "No annual fee"
                              : " "}
                          </p>
                        </div>
                      </div>
                      {c.owned ? (
                        <Button variant="secondary" disabled>
                          Added ✓
                        </Button>
                      ) : (
                        <Button
                          onClick={() => onAdd(c.cardKey, false)}
                          disabled={adding === c.cardKey}
                        >
                          {adding === c.cardKey ? "Adding…" : "Add"}
                        </Button>
                      )}
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )
      ) : (
        <div className="mt-6">
          {shown.length > 0 ? (
            <div className="flex flex-col gap-2">
              {shown.map((c) => (
                <Card
                  key={c.cardKey}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="font-semibold text-ink">{c.cardName}</p>
                    <p className="text-[13px] text-secondary">{c.cardIssuer}</p>
                  </div>
                  <Button
                    onClick={() => onAdd(c.cardKey, true)}
                    disabled={adding === c.cardKey}
                  >
                    {adding === c.cardKey ? "Adding…" : "Add"}
                  </Button>
                </Card>
              ))}
            </div>
          ) : searching || localResults === undefined ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : (
            <EmptyState
              title={searched ? "No matches" : "Keep typing…"}
              description={
                searched
                  ? "Try a different card name."
                  : "Search the card catalog for the cards you own."
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
