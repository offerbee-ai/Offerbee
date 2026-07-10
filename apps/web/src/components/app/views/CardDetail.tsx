"use client";

import Link from "next/link";
import { useApp } from "../AppProvider";
import { CYCLE_LABEL, usd } from "../data";
import { MarkUsedButton, ProgressBar, MonoLabel, Panel } from "../controls";
import { ChevronLeftIcon } from "@/components/landing/icons";

export function CardDetail({ cardId }: { cardId: string }) {
  const { derived, credits, markUsed } = useApp();
  const card = derived.cards.find((c) => c.id === cardId);

  const backLink = (
    <Link
      href="/app/cards"
      className="mb-[18px] inline-flex items-center gap-1.5 text-[14px] font-semibold text-accent hover:underline"
    >
      <ChevronLeftIcon size={16} />
      All cards
    </Link>
  );

  if (!card) {
    return (
      <div>
        {backLink}
        <Panel className="px-6 py-14 text-center text-[15px] text-secondary">
          That card isn&apos;t in your wallet.
        </Panel>
      </div>
    );
  }

  const netColor = card.keep ? "var(--ob-accent)" : "var(--ob-warning)";
  const netLine = card.keep
    ? `+$${card.net} over the $${card.fee} fee`
    : `−$${Math.abs(card.net)} under the $${card.fee} fee`;
  const cardCredits = credits.filter((c) => c.cardId === cardId);

  return (
    <div>
      {backLink}

      <div className="grid grid-cols-1 gap-[22px] lg:grid-cols-[1fr_1.4fr]">
        {/* Left column */}
        <div className="flex flex-col gap-[18px]">
          <div
            className="flex h-[172px] flex-col justify-between rounded-[18px] p-[22px]"
            style={{
              background: card.color,
              backgroundImage:
                "linear-gradient(140deg, rgba(255,255,255,.18), rgba(0,0,0,.28))",
            }}
          >
            <div
              className="font-display text-[21px] font-semibold"
              style={{ color: "#F1ECE0" }}
            >
              {card.name}
            </div>
            <div>
              <span
                className="mb-3 block h-[26px] w-[34px] rounded-[5px]"
                style={{ background: "rgba(255,255,255,.32)" }}
              />
              <div className="text-[12.5px]" style={{ color: "#DED9CD" }}>
                {card.terms}
              </div>
            </div>
          </div>

          <Panel className="p-5">
            <div className="flex items-center justify-between">
              <MonoLabel>Captured this year</MonoLabel>
              <span
                className="rounded-[7px] px-[10px] py-1 text-[11px] font-semibold"
                style={{
                  color: netColor,
                  background: card.keep ? "var(--ob-accent-soft)" : "var(--ob-warning-soft)",
                }}
              >
                {card.verdict}
              </span>
            </div>
            <div className="tabular mt-1.5 font-mono text-[34px] font-semibold tracking-[-0.03em] text-ink">
              {usd(card.captured)}
            </div>
            <div className="mt-3">
              <ProgressBar pct={card.pct} color={netColor} height={8} />
            </div>
            <div className="mt-[9px] text-[13px] font-semibold" style={{ color: netColor }}>
              {netLine}
            </div>
          </Panel>
        </div>

        {/* Right column — credits list */}
        <Panel className="overflow-hidden">
          <div className="px-4 pb-1 pt-5 sm:px-6">
            <h2 className="font-display text-[19px] font-semibold text-ink">
              Credits · {cardCredits.length}
            </h2>
          </div>
          <div>
            {cardCredits.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 border-t border-separator px-4 py-[14px] sm:px-6"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-semibold text-ink">
                    {c.name}
                  </div>
                  <div
                    className="text-[12.5px]"
                    style={{
                      color:
                        !c.used && c.days <= 3
                          ? "var(--ob-alert)"
                          : "var(--ob-secondary)",
                    }}
                  >
                    {CYCLE_LABEL[c.cycle]} · {c.used ? "used" : "available"}
                  </div>
                </div>
                <div className="tabular font-mono text-[13px] font-semibold text-secondary">
                  {c.used ? `$${c.amount}/$${c.amount}` : `$0/$${c.amount}`}
                </div>
                <MarkUsedButton used={c.used} onClick={() => markUsed(c.id)} />
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
