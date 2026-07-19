"use client";

import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Card, EmptyState, Spinner } from "@/components/app/ui";

export default function TipsPage() {
  const tips = useQuery(api.tips.listTips);

  if (tips === undefined)
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );

  if (tips.length === 0)
    return (
      <EmptyState
        title="No tips yet"
        description="Add cards to your wallet and OfferBee will surface perks to use, foreign-fee warnings, and the best card for each spend category here."
      />
    );

  return (
    <div>
      <div className="flex flex-col gap-2">
        {tips.map((tip, i) => (
          <Card key={`${tip.type}-${tip.cardKey ?? "x"}-${i}`}>
            <p className="font-semibold text-ink">{tip.title}</p>
            <p className="mt-1 text-[14px] text-body">{tip.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
