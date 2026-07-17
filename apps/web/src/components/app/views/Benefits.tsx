"use client";

import Link from "next/link";
import { useApp, type BenefitFilter, type ExpiringRange } from "../AppProvider";
import { expiringGroups, filterBenefits, hasGrid, usd } from "../data";
import {
  BrandChip,
  DaysTile,
  LogPartialButton,
  MarkUsedButton,
  Segmented,
  Panel,
} from "../controls";
import { PeriodGrid } from "../PeriodGrid";
import { DetectedCredits } from "../DetectedCredits";
import { EmptyState, Spinner } from "../ui";
import type { DerivedCredit } from "../data";

// Real card art when we have it, else the deterministic color chip.
function CardMark({
  credit,
  width,
  height,
}: {
  credit: DerivedCredit;
  width: number;
  height: number;
}) {
  if (credit.image)
    // Plain <img>: the card-image host path rotates (see wallet page).
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={credit.image}
        alt=""
        style={{ width, height }}
        className="shrink-0 rounded-[6px] border border-border object-cover"
      />
    );
  return <BrandChip color={credit.color} width={width} height={height} />;
}

const FILTERS: { value: BenefitFilter; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semiannual", label: "Semiannual" },
  { value: "annual", label: "Annual" },
  { value: "all", label: "All" },
];

const RANGES: { value: ExpiringRange; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

// Each row is its own grid, so tracks must be content-independent to line up
// across rows + header: minmax(0,fr) columns truncate instead of pushing, and
// the amount/status columns are fixed-width (status content varies per row).
// Mobile drops the standalone Amount column (redundant — the reset line already
// shows the dollar figure) so the credit text isn't starved: just credit +
// actions. md+ restores the full Credit/Card/Amount/Status table.
const GRID =
  "items-center gap-3 px-4 sm:px-6 md:gap-[14px] grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.8fr)_minmax(0,1.2fr)_88px_188px]";
const HEAD =
  "font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-tertiary";

export function Benefits() {
  const {
    credits,
    isLoading,
    benefitFilter,
    setBenefitFilter,
    expiringRange,
    setExpiringRange,
    search,
    markUsed,
    logPartial,
    snooze,
    pending,
  } = useApp();

  if (isLoading)
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );

  if (credits.length === 0)
    return (
      <EmptyState
        title="No credits tracked yet"
        description="Open a card in your wallet to track its statement credits, then log usage here."
        action={
          <Link
            href="/app/wallet"
            className="rounded-button bg-accent px-4 py-2 text-[14px] font-semibold text-on-accent hover:bg-accent-strong"
          >
            Go to wallet
          </Link>
        }
      />
    );

  const { groups, total } = expiringGroups(credits, expiringRange);
  const { visible, available, openCount } = filterBenefits(
    credits,
    benefitFilter,
    search,
  );

  return (
    <div className="flex flex-col gap-7">
      {/* ── Detected (Plaid suggestions awaiting confirm) ── */}
      <DetectedCredits />

      {/* ── Expiring soon (folded-in former Expiring view) ── */}
      {groups.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-[19px] font-semibold text-ink">
                Expiring soon
              </h2>
              <Segmented
                value={expiringRange}
                onChange={setExpiringRange}
                options={RANGES}
              />
            </div>
            <div className="tabular font-mono text-[14px] font-semibold text-alert">
              {usd(total)} at risk
            </div>
          </div>

          {groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <span
                  className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em]"
                  style={{ color: group.urgent ? "var(--ob-alert)" : "var(--ob-tertiary)" }}
                >
                  {group.label}
                </span>
                <span className="tabular font-mono text-[12px] font-semibold text-secondary">
                  {group.sumStr}
                </span>
              </div>

              <Panel className="overflow-hidden">
                {group.items.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-3 border-t border-separator px-4 py-4 first:border-t-0 sm:px-5"
                  >
                    <DaysTile days={c.days} size={48} urgent={c.days <= 7} />
                    <CardMark credit={c} width={38} height={25} />
                    <div className="min-w-0 flex-1 basis-[120px]">
                      <div className="truncate text-[15px] font-semibold text-ink">
                        {c.name}
                      </div>
                      <div className="truncate text-[12.5px] text-secondary">
                        {c.sub}
                      </div>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      {hasGrid(c.cycle) && c.periods ? (
                        <PeriodGrid
                          periods={c.periods}
                          amount={c.amount}
                          onMarkCurrent={() => markUsed(c.id)}
                          onLogPartial={(amt) => logPartial(c.id, amt)}
                          pending={pending.has(c.id)}
                        />
                      ) : (
                        <>
                          <MarkUsedButton used={c.used} onClick={() => markUsed(c.id)} />
                          <LogPartialButton
                            onLog={(amt) => logPartial(c.id, amt)}
                            disabled={pending.has(c.id)}
                          />
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => snooze(c.id)}
                        disabled={pending.has(c.id)}
                        className="rounded-[9px] border border-border px-[13px] py-2 text-[12.5px] font-semibold text-secondary transition-colors hover:text-ink disabled:opacity-50"
                      >
                        Snooze
                      </button>
                    </div>
                  </div>
                ))}
              </Panel>
            </div>
          ))}
        </section>
      )}

      {/* ── Full credits ledger ── */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            value={benefitFilter}
            onChange={setBenefitFilter}
            options={FILTERS}
          />
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
            <div className={HEAD}>Amount</div>
            <div className={`${HEAD} text-right`}>Status</div>
          </div>

          {visible.length === 0 ? (
            <div className="px-6 py-12 text-center text-[14px] text-secondary">
              No credits match {search ? `“${search}”` : "this filter"}.
            </div>
          ) : (
            visible.map((c) => (
              <div
                key={c.id}
                className={`grid ${GRID} border-t border-separator py-[14px] first:border-t-0`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <CardMark credit={c} width={32} height={22} />
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
                    {/* Monthly credits have no period grid, so prior-month usage
                        would otherwise be invisible — surface the year-to-date
                        captured total. Non-monthly show their history in the grid. */}
                    {!hasGrid(c.cycle) && c.capturedYtd > 0 && (
                      <div className="truncate text-[11.5px] text-accent">
                        {usd(c.capturedYtd)} captured this year
                      </div>
                    )}
                    <div className="truncate text-[11.5px] text-tertiary md:hidden">
                      {c.card}
                    </div>
                  </div>
                </div>
                <div className="hidden truncate text-[13.5px] text-secondary md:block">
                  {c.card}
                </div>
                <div className="hidden tabular font-mono text-[13px] font-semibold text-ink md:block">
                  {c.amountStr}
                </div>
                <div className="flex items-center justify-end gap-2">
                  {hasGrid(c.cycle) && c.periods ? (
                    <PeriodGrid
                      periods={c.periods}
                      amount={c.amount}
                      onMarkCurrent={() => markUsed(c.id)}
                      onLogPartial={(amt) => logPartial(c.id, amt)}
                      pending={pending.has(c.id)}
                    />
                  ) : (
                    <>
                      {!c.used && (
                        <LogPartialButton
                          onLog={(amt) => logPartial(c.id, amt)}
                          disabled={pending.has(c.id)}
                        />
                      )}
                      <MarkUsedButton used={c.used} onClick={() => markUsed(c.id)} />
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </Panel>
      </section>
    </div>
  );
}
