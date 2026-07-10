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

// Header + rows share this grid so columns align like a statement. On mobile
// it collapses to 3 columns (Credit / Amount / Status) and the Card column is
// dropped — its value is folded into the credit cell instead.
const GRID =
  "items-center gap-3 px-4 sm:px-6 md:gap-[14px] grid-cols-[1fr_auto_auto] md:grid-cols-[1.6fr_1fr_0.8fr_auto]";
const HEAD =
  "font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-tertiary";

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
        <div className={`hidden md:grid ${GRID} border-b border-separator py-3`}>
          <div className={HEAD}>Credit</div>
          <div className={HEAD}>Card</div>
          <div className={HEAD}>Cycle</div>
          <div className={`${HEAD} text-right`}>Status</div>
        </div>

        {visible.length === 0 ? (
          <div className="px-6 py-12 text-center text-[14px] text-secondary">
            No credits match {search ? `“${search}”` : "this filter"}.
          </div>
        ) : (
          visible.map((c) => (
            <div key={c.id} className={`grid ${GRID} border-t border-separator py-[14px] first:border-t-0`}>
              <div className="flex min-w-0 items-center gap-3">
                <BrandChip color={c.color} width={30} height={21} />
                <div className="min-w-0">
                  <div className="truncate text-[14.5px] font-semibold text-ink">
                    {c.name}
                  </div>
                  <div
                    className="truncate text-[12px]"
                    style={{ color: c.urgentReset ? "var(--ob-alert)" : "var(--ob-secondary)" }}
                  >
                    {c.reset}
                  </div>
                  {/* Card name (its own column on desktop) folds in here on mobile. */}
                  <div className="truncate text-[11.5px] text-tertiary md:hidden">
                    {c.card}
                  </div>
                </div>
              </div>
              <div className="hidden truncate text-[13.5px] text-secondary md:block">
                {c.card}
              </div>
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
