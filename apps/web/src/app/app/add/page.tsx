"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction, useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Button, Card, EmptyState, Spinner } from "@/components/app/ui";

type Result = { cardKey: string; cardName: string; cardIssuer: string };

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
  const reqId = useRef(0);

  // Debounced live search against the card API's name-search endpoint.
  useEffect(() => {
    const t = term.trim();
    if (t.length < 2) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    const id = ++reqId.current;
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

  const onAdd = async (cardKey: string) => {
    setAdding(cardKey);
    setError(null);
    try {
      await addCard({ cardKey });
      router.push("/app/cards");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add card");
      setAdding(null);
    }
  };

  return (
    <div>
      <h1 className="mb-6 font-display text-[28px] font-semibold text-ink">
        Add a card
      </h1>

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

      <div className="mt-6">
        {searching ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            title={searched ? "No matches" : "Start typing to search"}
            description={
              searched
                ? "Try a different card name."
                : "Search the card catalog for the cards you own."
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {results.map((c) => (
              <Card
                key={c.cardKey}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="font-semibold text-ink">{c.cardName}</p>
                  <p className="text-[13px] text-secondary">{c.cardIssuer}</p>
                </div>
                <Button
                  onClick={() => onAdd(c.cardKey)}
                  disabled={adding === c.cardKey}
                >
                  {adding === c.cardKey ? "Adding…" : "Add"}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
