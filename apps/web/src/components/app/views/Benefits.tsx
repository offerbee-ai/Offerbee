"use client";

import { useApp } from "../AppProvider";
import { filterBenefits, usd } from "../data";
import { BrandChip, MarkUsedButton, Segmented, Panel } from "../controls";
import { type BenefitFilter } from "../AppProvider";

const FILTERS: { value: BenefitFilter; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "all", label: "All" },
];

// header + rows share this grid so columns align like a statement.
const GRID = "grid grid-cols-[1.6fr_1fr_0.8fr_auto] items-center gap-[14px] px-6";

export function Benefits() {
  const { credits, benefitFilter, setBenefitFilter, search, markUsed } = useApp();
  const { visible, available, openCount } = filterBenefits(credits, benefitFilter, search);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={benefitFilter} onChange={setBenefitFilter} options={FILTERS} />
        <div className="text-[13.5px] text-secondary">
          <strong className="tabular font-mono font-semibold text-ink">
            {usd(available)}
          </strong>{" "}
          still available across {openCount} credits
        </div>
      </div>

      <Panel className="overflow-hidden">
        <div className={`${GRID} border-b border-separator py-3`}>
          <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-tertiary">
            Credit
          </div>
          <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-tertiary">
            Card
          </div>
          <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-tertiary">
            Cycle
          </div>
          <div className="text-right font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-tertiary">
            Status
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="px-6 py-12 text-center text-[14px] text-secondary">
            No credits match {search ? `“${search}”` : "this filter"}.
          </div>
        ) : (
          visible.map((c) => (
            <div key={c.id} className={`${GRID} border-t border-separator py-[14px] first:border-t-0`}>
              <div className="flex min-w-0 items-center gap-3">
                <BrandChip color={c.color} width={30} height={21} />
                <div className="min-w-0">
                  <div className="truncate text-[14.5px] font-semibold text-ink">
                    {c.name}
                  </div>
                  <div
                    className="text-[12px]"
                    style={{ color: c.urgentReset ? "var(--ob-alert)" : "var(--ob-secondary)" }}
                  >
                    {c.reset}
                  </div>
                </div>
              </div>
              <div className="truncate text-[13.5px] text-secondary">{c.card}</div>
              <div className="tabular font-mono text-[13px] font-semibold text-ink">
                {c.amountStr}
              </div>
              <div className="flex justify-end">
                <MarkUsedButton used={c.used} onClick={() => markUsed(c.id)} />
              </div>
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}
