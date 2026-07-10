"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Button, Card, Pill, SectionLabel, Spinner } from "@/components/app/ui";

function toInputDate(ms: number | undefined): string {
  if (ms === undefined) return "";
  return new Date(ms).toISOString().slice(0, 10);
}
function fromInputDate(value: string): number | undefined {
  return value ? new Date(value).getTime() : undefined;
}

export default function CardDetailPage() {
  const params = useParams<{ cardKey: string }>();
  const cardKey = decodeURIComponent(params.cardKey);

  const detail = useQuery(api.catalog.getCardDetail, { cardKey });
  const myCards = useQuery(api.wallet.listMyCards);
  const updateCardDates = useMutation(api.wallet.updateCardDates);

  const owned = myCards?.find((c) => c.userCard.cardKey === cardKey)?.userCard;

  const [openedDate, setOpenedDate] = useState("");
  const [signupStart, setSignupStart] = useState("");
  const [bonusMet, setBonusMet] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!owned) return;
    /* eslint-disable react-hooks/set-state-in-effect -- seed the edit form once the owned card loads */
    setOpenedDate(toInputDate(owned.openedDate));
    setSignupStart(toInputDate(owned.signupBonusStartDate));
    setBonusMet(Boolean(owned.signupBonusMet));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [owned]);

  const save = async () => {
    if (!owned) return;
    setSaved(false);
    await updateCardDates({
      userCardId: owned._id,
      openedDate: fromInputDate(openedDate),
      signupBonusStartDate: fromInputDate(signupStart),
      signupBonusMet: bonusMet,
    });
    setSaved(true);
  };

  if (detail === undefined || myCards === undefined)
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );

  return (
    <div>
      <Link
        href="/app/wallet"
        className="text-[13px] font-semibold text-accent hover:underline"
      >
        ← Back to cards
      </Link>

      <h1 className="mt-3 font-display text-[30px] font-semibold text-ink">
        {detail?.cardName ?? cardKey}
      </h1>
      <p className="mt-1 text-[15px] text-secondary">
        {[detail?.cardIssuer, detail?.cardNetwork, detail?.cardType]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {detail === null && (
        <p className="mt-4 text-[14px] text-tertiary">
          We&apos;re still fetching this card&apos;s details from the catalog —
          check back in a moment.
        </p>
      )}

      {/* Owner-supplied dates that power the deadline reminders. */}
      {owned && (
        <Card className="mt-6">
          <SectionLabel>Your card</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-[13px] font-medium text-body">
              Date opened
              <input
                type="date"
                value={openedDate}
                onChange={(e) => setOpenedDate(e.target.value)}
                className="mt-1 w-full rounded-button border border-border bg-surface px-3 py-2 text-ink outline-none focus:border-accent"
              />
            </label>
            <label className="text-[13px] font-medium text-body">
              Bonus tracking start
              <input
                type="date"
                value={signupStart}
                onChange={(e) => setSignupStart(e.target.value)}
                className="mt-1 w-full rounded-button border border-border bg-surface px-3 py-2 text-ink outline-none focus:border-accent"
              />
            </label>
          </div>
          <label className="mt-4 flex items-center gap-2 text-[14px] text-body">
            <input
              type="checkbox"
              checked={bonusMet}
              onChange={(e) => setBonusMet(e.target.checked)}
            />
            I&apos;ve already met the signup bonus spend
          </label>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={save}>Save</Button>
            {saved && (
              <span className="text-[13px] font-medium text-accent">Saved</span>
            )}
          </div>
        </Card>
      )}

      {detail && (
        <div className="mt-6 grid gap-4">
          {/* Fees */}
          <Card>
            <SectionLabel>Fees</SectionLabel>
            <div className="flex flex-wrap gap-6 text-[14px] text-body">
              <span>
                Annual fee{" "}
                <span className="tabular font-mono text-ink">
                  ${detail.annualFee ?? 0}
                </span>
              </span>
              {detail.isFxFee && (
                <span>
                  Foreign transaction fee{" "}
                  <span className="tabular font-mono text-ink">
                    {detail.fxFee}%
                  </span>
                </span>
              )}
            </div>
          </Card>

          {/* Signup bonus */}
          {detail.isSignupBonus && (
            <Card>
              <SectionLabel>Signup bonus</SectionLabel>
              <p className="text-[15px] text-ink">
                {detail.signupBonusAmount} {detail.signupBonusType}
                {detail.signupBonusSpend
                  ? ` after $${detail.signupBonusSpend} spend`
                  : ""}
                {detail.signupBonusLength
                  ? ` in ${detail.signupBonusLength} ${detail.signupBonusLengthPeriod ?? "months"}`
                  : ""}
              </p>
              {detail.signupBonusDesc && (
                <p className="mt-1 text-[13px] text-secondary">
                  {detail.signupBonusDesc}
                </p>
              )}
            </Card>
          )}

          {/* Bonus categories */}
          {detail.spendBonusCategory &&
            detail.spendBonusCategory.length > 0 && (
              <Card>
                <SectionLabel>Bonus categories</SectionLabel>
                <div className="flex flex-col gap-2">
                  {detail.spendBonusCategory.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-[14px]"
                    >
                      <span className="text-ink">
                        {c.spendBonusCategoryName ??
                          c.spendBonusCategoryType ??
                          "Category"}
                      </span>
                      {c.earnMultiplier !== undefined && (
                        <Pill tone="accent">{c.earnMultiplier}x</Pill>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

          {/* Benefits */}
          {detail.benefit && detail.benefit.length > 0 && (
            <Card>
              <SectionLabel>Benefits</SectionLabel>
              <ul className="flex flex-col gap-3">
                {detail.benefit.map((b, i) => (
                  <li key={i}>
                    <p className="text-[14px] font-semibold text-ink">
                      {b.benefitTitle}
                    </p>
                    {b.benefitDesc && (
                      <p className="text-[13px] text-secondary">
                        {b.benefitDesc}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
