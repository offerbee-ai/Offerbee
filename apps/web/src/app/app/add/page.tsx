"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Button, Card, EmptyState, Spinner } from "@/components/app/ui";

export default function AddCardPage() {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(t);
  }, [term]);

  const results = useQuery(api.catalog.searchCatalog, {
    term: debounced,
    paginationOpts: { numItems: 20, cursor: null },
  });
  const addCard = useMutation(api.wallet.addCard);

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
        placeholder="Search by card name (e.g. Sapphire Preferred)"
        className="w-full rounded-button border border-border bg-surface px-4 py-3 text-[15px] text-ink outline-none placeholder:text-tertiary focus:border-accent"
      />

      {error && (
        <p className="mt-3 text-[13px] font-medium text-alert">{error}</p>
      )}

      <div className="mt-6">
        {results === undefined ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : results.page.length === 0 ? (
          <EmptyState
            title={debounced ? "No matches" : "Start typing to search"}
            description={
              debounced
                ? "Try a different card name or issuer."
                : "Search the catalog for the cards you own."
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {results.page.map((c) => (
              <Card
                key={c._id}
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
