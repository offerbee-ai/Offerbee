"use client";

import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { Button, Card, EmptyState, Pill, Spinner } from "@/components/app/ui";

export default function CardsPage() {
  const cards = useQuery(api.wallet.listMyCards);
  const removeCard = useMutation(api.wallet.removeCard);

  if (cards === undefined)
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );

  if (cards.length === 0)
    return (
      <EmptyState
        title="No cards yet"
        description="Add the credit cards you own to start tracking rewards, benefits, and offers."
        action={
          <Link href="/app/add">
            <Button>Add your first card</Button>
          </Link>
        }
      />
    );

  const onRemove = async (userCardId: Id<"userCards">) => {
    try {
      await removeCard({ userCardId });
    } catch (e) {
      console.error("Failed to remove card", e);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-[28px] font-semibold text-ink">
          Your cards
        </h1>
        <Link href="/app/add">
          <Button>Add card</Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map(({ userCard, detail, catalog }) => {
          const name = detail?.cardName ?? catalog?.cardName ?? userCard.cardKey;
          const issuer = detail?.cardIssuer ?? catalog?.cardIssuer;
          return (
            <Card key={userCard._id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/app/wallet/${encodeURIComponent(userCard.cardKey)}`}
                    className="font-display text-[18px] font-semibold text-ink hover:text-accent"
                  >
                    {userCard.nickname ?? name}
                  </Link>
                  {issuer && (
                    <p className="mt-0.5 text-[13px] text-secondary">{issuer}</p>
                  )}
                </div>
                {detail?.isSignupBonus && <Pill tone="accent">Bonus</Pill>}
              </div>

              <div className="mt-4 flex items-center gap-4 text-[13px] text-body">
                {detail?.annualFee !== undefined && (
                  <span>
                    Annual fee{" "}
                    <span className="tabular font-mono text-ink">
                      ${detail.annualFee}
                    </span>
                  </span>
                )}
                {detail === null && (
                  <span className="text-tertiary">Fetching details…</span>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <Link
                  href={`/app/wallet/${encodeURIComponent(userCard.cardKey)}`}
                  className="text-[13px] font-semibold text-accent hover:underline"
                >
                  View details
                </Link>
                <Button
                  variant="danger"
                  onClick={() => onRemove(userCard._id)}
                >
                  Remove
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
