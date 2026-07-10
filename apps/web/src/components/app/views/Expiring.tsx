"use client";

import { useApp, type ExpiringRange } from "../AppProvider";
import { expiringGroups, usd } from "../data";
import { BrandChip, DaysTile, MarkUsedButton, Segmented, Panel } from "../controls";

const RANGES: { value: ExpiringRange; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

export function Expiring() {
  const { credits, expiringRange, setExpiringRange, markUsed, snooze } = useApp();
  const { groups, total } = expiringGroups(credits, expiringRange);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={expiringRange} onChange={setExpiringRange} options={RANGES} />
        <div className="tabular font-mono text-[14px] font-semibold text-alert">
          {usd(total)} at risk
        </div>
      </div>

      {groups.length === 0 ? (
        <Panel className="px-6 py-14 text-center text-[15px] text-secondary">
          Nothing resets in this window — you&apos;re all caught up.
        </Panel>
      ) : (
        groups.map((group) => (
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
                  className="flex items-center gap-3 border-t border-separator px-5 py-4 first:border-t-0"
                >
                  <DaysTile days={c.days} size={48} urgent={c.days <= 7} />
                  <BrandChip color={c.color} width={36} height={24} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold text-ink">
                      {c.name}
                    </div>
                    <div className="text-[12.5px] text-secondary">{c.sub}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MarkUsedButton used={c.used} onClick={() => markUsed(c.id)} />
                    <button
                      type="button"
                      onClick={() => snooze(c.id)}
                      className="rounded-[9px] border border-border px-[13px] py-2 text-[12.5px] font-semibold text-secondary transition-colors hover:text-ink"
                    >
                      Snooze
                    </button>
                  </div>
                </div>
              ))}
            </Panel>
          </div>
        ))
      )}
    </div>
  );
}
