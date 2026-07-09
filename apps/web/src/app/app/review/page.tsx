"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { Button, Card, EmptyState, Pill, Spinner } from "@/components/app/ui";

type Scalar = number | string | boolean | undefined;

const FIELD_LABELS: Record<string, string> = {
  annualFee: "Annual fee",
  signupBonusAmount: "Signup bonus",
  signupBonusSpend: "Min. spend",
};

const REASON_LABELS: Record<string, string> = {
  "source-mismatch": "Sources disagree",
  "single-source": "Single source",
  "stale-recheck": "Stale re-check",
};

const SOURCE_LABELS: Record<string, string> = {
  rapidapi: "Card API",
  github: "Bonuses DB",
  web: "Web",
  manual: "Manual",
};

function fmt(field: string, value: Scalar) {
  if (value === undefined || value === null) return "—";
  if (field === "annualFee" || field === "signupBonusSpend")
    return `$${Number(value).toLocaleString()}`;
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

export default function ReviewPage() {
  const reviews = useQuery(api.review.listPendingReviews);
  const confirm = useMutation(api.review.confirmReview);
  const reject = useMutation(api.review.rejectReview);
  const [busy, setBusy] = useState<string | null>(null);

  if (reviews === undefined)
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );

  if (reviews.length === 0)
    return (
      <EmptyState
        title="Nothing to review"
        description="When the card API disagrees with the cross-check source (or a web check finds a newer value), proposed corrections show up here for your one-click confirmation."
      />
    );

  const act = async (
    fn: typeof confirm,
    id: Id<"cardDataReview">,
    tag: string,
  ) => {
    setBusy(tag);
    try {
      await fn({ reviewId: id });
    } catch (e) {
      console.error("review action failed", e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="font-display text-[28px] font-semibold text-ink">
          Data review
        </h1>
        <Pill tone="warning">{reviews.length} pending</Pill>
      </div>
      <p className="mb-6 max-w-[60ch] text-[14px] text-body">
        Each proposal was flagged by cross-checking the card API against a second
        source. Confirm to write the corrected value; reject to keep the current
        one.
      </p>

      <div className="flex flex-col gap-3">
        {reviews.map((r) => {
          const confirmTag = `${r._id}:confirm`;
          const rejectTag = `${r._id}:reject`;
          return (
            <Card key={r._id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-ink">{r.cardName}</p>
                  <p className="text-[13px] text-secondary">
                    {r.cardIssuer ?? r.cardKey}
                  </p>
                </div>
                <Pill tone="neutral">{REASON_LABELS[r.reason] ?? r.reason}</Pill>
              </div>

              <div className="flex flex-wrap items-center gap-4 rounded-card bg-field px-4 py-3">
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-tertiary">
                    {FIELD_LABELS[r.field] ?? r.field}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[15px]">
                    <span className="text-secondary line-through">
                      {fmt(r.field, r.currentValue as Scalar)}
                    </span>
                    <span className="text-tertiary">→</span>
                    <span className="font-semibold text-ink">
                      {fmt(r.field, r.proposedValue as Scalar)}
                    </span>
                  </div>
                </div>
                <div className="ml-auto flex flex-wrap gap-1.5">
                  {r.observations.map((o, i) => (
                    <Pill key={i} tone={o.source === "web" ? "accent" : "neutral"}>
                      {SOURCE_LABELS[o.source] ?? o.source}:{" "}
                      {fmt(r.field, o.value as Scalar)}
                    </Pill>
                  ))}
                </div>
              </div>

              {r.note && (
                <p className="text-[13px] text-body">
                  {r.note}
                  {r.sourceUrl && (
                    <>
                      {" "}
                      <a
                        href={r.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-accent hover:underline"
                      >
                        source
                      </a>
                    </>
                  )}
                  {typeof r.confidence === "number" && (
                    <span className="text-tertiary">
                      {" "}
                      · {Math.round(r.confidence * 100)}% confidence
                    </span>
                  )}
                </p>
              )}

              <div className="flex gap-2">
                <Button
                  disabled={busy !== null}
                  onClick={() => act(confirm, r._id, confirmTag)}
                >
                  {busy === confirmTag ? "Applying…" : "Confirm correction"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => act(reject, r._id, rejectTag)}
                >
                  {busy === rejectTag ? "Keeping…" : "Keep current"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
