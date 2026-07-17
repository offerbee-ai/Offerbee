"use client";

import Link from "next/link";
import { useApp, type BenefitFilter, type ExpiringRange } from "../AppProvider";
import { expiringGroups, filterBenefits, usd } from "../data";
import {
  BrandChip,
  CircleCheck,
  RowOverflow,
  Segmented,
  Panel,
} from "../controls";
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

// 4-column table: Benefit (chip+name+card) / To claim / Year so far / Done.
// fr tracks truncate; Year-so-far + Done are fixed so the circle right-aligns.
const GRID =
  "items-center gap-3 px-4 sm:px-6 md:gap-[14px] grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1.2fr)_60px]";
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
                    className="grid items-center gap-3 border-t border-separator px-4 py-4 first:border-t-0 sm:px-5 grid-cols-[minmax(0,1fr)_auto_60px]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <CardMark credit={c} width={34} height={23} />
                      <div className="min-w-0">
                        <div className="truncate text-[14.5px] font-semibold text-ink">
                          {c.name}
                        </div>
                        <div className="truncate text-[12px] text-secondary">
                          {c.card}
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0 text-right">
                      <div className="tabular font-mono text-[14px] font-semibold text-ink">
                        {c.amountStr}
                      </div>
                      <div
                        className="truncate text-[11.5px]"
                        style={{ color: c.cadenceAlert ? "var(--ob-alert)" : "var(--ob-secondary)" }}
                      >
                        {c.resetShort}
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <div className="hidden md:block">
                        <RowOverflow
                          onLogPartial={(amt) => logPartial(c.id, amt)}
                          onSnooze={() => snooze(c.id)}
                          disabled={pending.has(c.id)}
                        />
                      </div>
                      <CircleCheck
                        claimed={c.used}
                        onClick={() => markUsed(c.id)}
                        disabled={pending.has(c.id)}
                      />
                    </div>
                  </div>
                ))}
              </Panel>
            </div>
          ))}
        </section>
      )}

      {/* ── Full credits ledger (screen 4a) ── */}
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
            <div className={HEAD}>Benefit</div>
            <div className={HEAD}>To claim</div>
            <div className={HEAD}>Year so far</div>
            <div className={`${HEAD} text-right`}>Done</div>
          </div>

          {visible.length === 0 ? (
            <div className="px-6 py-12 text-center text-[14px] text-secondary">
              No credits match {search ? `“${search}”` : "this filter"}.
            </div>
          ) : (
            visible.map((c) => (
              <div
                key={c.id}
                className={`grid ${GRID} border-t border-separator py-[15px] first:border-t-0`}
                style={c.used ? { opacity: 0.65 } : undefined}
              >
                {/* Benefit: chip + name + card */}
                <div className="flex min-w-0 items-center gap-3">
                  <CardMark credit={c} width={34} height={23} />
                  <div className="min-w-0">
                    <div className="truncate text-[14.5px] font-semibold text-ink">
                      {c.name}
                    </div>
                    <div className="truncate text-[12px] text-secondary">
                      {c.card}
                    </div>
                    {/* mobile-only: amount + cadence (To-claim/Year cols are md+ only) */}
                    <div className="mt-0.5 truncate text-[11.5px] md:hidden">
                      {c.used ? (
                        <span className="text-secondary">
                          <span className="font-mono text-tertiary line-through">{c.amountStr}</span>
                          {c.claimedLabel ? ` · ${c.claimedLabel}` : ""}
                        </span>
                      ) : (
                        <span style={{ color: c.cadenceAlert ? "var(--ob-alert)" : "var(--ob-secondary)" }}>
                          <span className="font-mono font-semibold text-ink">{c.amountStr}</span>{" "}
                          to claim · {c.cadence}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* To claim: amount + cadence, or struck + claimed date */}
                <div className="hidden min-w-0 md:block">
                  {c.used ? (
                    <>
                      <div className="tabular font-mono text-[14px] font-semibold text-tertiary line-through">
                        {c.amountStr}
                      </div>
                      {c.claimedLabel && (
                        <div className="truncate text-[11.5px] text-secondary">
                          {c.claimedLabel}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="tabular font-mono text-[14px] font-semibold text-ink">
                        {c.amountStr}{" "}
                        <span className="text-[11px] font-normal text-tertiary">to claim</span>
                      </div>
                      <div
                        className="truncate text-[11.5px]"
                        style={{ color: c.cadenceAlert ? "var(--ob-alert)" : "var(--ob-secondary)" }}
                      >
                        {c.cadence}
                      </div>
                    </>
                  )}
                </div>

                {/* Year so far: bar + "$X of $Y/yr" */}
                <div className="hidden min-w-0 md:block">
                  <div className="mb-[5px] h-[6px] overflow-hidden rounded-[4px] bg-track">
                    <div
                      className="h-full bg-accent transition-[width] duration-500"
                      style={{ width: `${c.yearBarPct}%` }}
                    />
                  </div>
                  <div className="truncate text-[11.5px] text-secondary">
                    <span className="tabular font-mono font-semibold text-ink">
                      {usd(c.capturedYtd)}
                    </span>{" "}
                    of {usd(c.annualValue)}/yr
                  </div>
                </div>

                {/* Done: overflow (hover) + circle-check */}
                <div className="flex items-center justify-end gap-1">
                  {!c.used && (
                    <div className="hidden md:block">
                      <RowOverflow
                        onLogPartial={(amt) => logPartial(c.id, amt)}
                        onSnooze={() => snooze(c.id)}
                        disabled={pending.has(c.id)}
                      />
                    </div>
                  )}
                  <CircleCheck
                    claimed={c.used}
                    onClick={() => markUsed(c.id)}
                    disabled={pending.has(c.id)}
                  />
                </div>
              </div>
            ))
          )}
        </Panel>
      </section>
    </div>
  );
}
