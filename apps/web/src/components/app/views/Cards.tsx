"use client";

import Link from "next/link";
import { useApp } from "../AppProvider";
import { usd, netStr } from "../data";
import { ProgressBar, Panel } from "../controls";

export function Cards() {
  const { derived } = useApp();
  const { cards, captured, fees, net } = derived;
  const keepCount = cards.filter((c) => c.keep).length;
  const reviewCount = cards.length - keepCount;

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Summary banner */}
      <Panel className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 px-5 py-5 sm:px-[26px] sm:py-6">
        <div>
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-tertiary">
            Net across {cards.length} cards
          </div>
          <div className="tabular mt-1 font-mono text-[38px] font-semibold tracking-[-0.02em] text-accent">
            {netStr(net)}
          </div>
          <div className="mt-0.5 text-[13px] text-secondary">
            {usd(captured)} captured · {usd(fees)} in fees
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div>
            <div className="tabular font-mono text-[22px] font-semibold text-accent">
              {keepCount}
            </div>
            <div className="text-[12.5px] text-secondary">worth keeping</div>
          </div>
          <div className="h-10 w-px bg-border" />
          <div>
            <div className="tabular font-mono text-[22px] font-semibold text-warning">
              {reviewCount}
            </div>
            <div className="text-[12.5px] text-secondary">to review</div>
          </div>
        </div>
      </Panel>

      {/* Card grid */}
      <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2">
        {cards.map((card) => {
          const netColor = card.keep ? "var(--ob-accent)" : "var(--ob-warning)";
          return (
            <Link
              key={card.id}
              href={`/app/cards/${card.id}`}
              className="rounded-[20px] border border-border bg-surface p-[22px] shadow-ob-sm transition-shadow hover:shadow-ob"
            >
              <div className="flex items-start justify-between">
                <span
                  className="block h-[56px] w-[88px] rounded-[10px]"
                  style={{
                    background: card.color,
                    backgroundImage:
                      "linear-gradient(140deg, rgba(255,255,255,.18), rgba(0,0,0,.15))",
                  }}
                />
                <span
                  className="rounded-[8px] px-[11px] py-[5px] text-[11px] font-semibold"
                  style={{
                    color: netColor,
                    background: card.keep
                      ? "var(--ob-accent-soft)"
                      : "var(--ob-warning-soft)",
                  }}
                >
                  {card.verdict}
                </span>
              </div>

              <div className="mt-4 font-display text-[20px] font-semibold text-ink">
                {card.name}
              </div>
              <div className="text-[13px] text-secondary">${card.fee} / yr</div>

              <div className="mt-4">
                <ProgressBar pct={card.pct} color={netColor} height={8} />
              </div>

              <div className="mt-[10px] flex items-center justify-between">
                <span className="text-[12.5px] text-secondary">
                  {usd(card.captured)} captured
                </span>
                <span
                  className="tabular font-mono text-[13.5px] font-semibold"
                  style={{ color: netColor }}
                >
                  {netStr(card.net)}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
