"use client";

import Link from "next/link";
import { useApp } from "../AppProvider";
import { dashExpiring, usd, netStr, type DerivedCredit, type DerivedCard } from "../data";
import {
  BrandChip,
  DaysTile,
  MarkUsedButton,
  ProgressBar,
  Segmented,
  StatTile,
  Panel,
  MonoLabel,
} from "../controls";
import { ChecklistIcon, ClockIcon } from "@/components/landing/icons";

function ResetRow({
  credit,
  tileSize,
  onToggle,
}: {
  credit: DerivedCredit;
  tileSize: number;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-separator px-6 py-[13px] first:border-t-0">
      <DaysTile days={credit.days} size={tileSize} urgent={credit.days <= 7} />
      <BrandChip color={credit.color} width={32} height={22} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14.5px] font-semibold text-ink">
          {credit.name}
        </div>
        <div className="text-[12.5px] text-secondary">{credit.sub}</div>
      </div>
      <MarkUsedButton used={credit.used} onClick={onToggle} />
    </div>
  );
}

function WalletRow({ card }: { card: DerivedCard }) {
  return (
    <Link
      href={`/app/cards/${card.id}`}
      className="flex items-center gap-3 border-t border-separator px-6 py-[13px] transition-colors first:border-t-0 hover:bg-surface-2"
    >
      <BrandChip color={card.color} width={34} height={23} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold text-ink">
          {card.name}
        </div>
        <div className="text-[12.5px] text-secondary">
          ${card.fee} fee · {usd(card.captured)} captured
        </div>
      </div>
      <div className="text-right">
        <div
          className="tabular font-mono text-[13.5px] font-semibold"
          style={{ color: card.keep ? "var(--ob-accent)" : "var(--ob-warning)" }}
        >
          {netStr(card.net)}
        </div>
        <div
          className="text-[10.5px] font-semibold"
          style={{ color: card.keep ? "var(--ob-accent)" : "var(--ob-warning)" }}
        >
          {card.verdict}
        </div>
      </div>
    </Link>
  );
}

function ListHeader({
  title,
  linkLabel,
  href,
}: {
  title: string;
  linkLabel: string;
  href: string;
}) {
  return (
    <div className="flex items-center justify-between px-6 pb-1 pt-5">
      <h2 className="font-display text-[19px] font-semibold text-ink">{title}</h2>
      <Link href={href} className="text-[13px] font-semibold text-accent hover:underline">
        {linkLabel}
      </Link>
    </div>
  );
}

export function Dashboard() {
  const { derived, credits, markUsed, dashLayout, setDashLayout } = useApp();
  const expiring = dashExpiring(credits);
  const { captured, total, pct, net, fees, remainMonth, atRisk, cards } = derived;

  return (
    <div className="flex flex-col gap-5">
      {/* Layout switcher — stakeholders compare A/B; A is the production default. */}
      <div className="flex items-center gap-3">
        <MonoLabel>Layout</MonoLabel>
        <Segmented
          value={dashLayout}
          onChange={setDashLayout}
          options={[
            { value: "A", label: "A · Focus" },
            { value: "B", label: "B · Grid" },
          ]}
        />
        <span className="text-[12.5px] text-tertiary">
          Two directions, same data — pick one in production.
        </span>
      </div>

      {dashLayout === "A" ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.55fr_1fr]">
          {/* Left column */}
          <div className="flex flex-col gap-5">
            <Panel className="px-7 py-[26px]">
              <div className="flex items-start justify-between">
                <MonoLabel>Captured value · 2026</MonoLabel>
                <span className="rounded-[8px] bg-accent-soft px-[10px] py-1 text-[12px] font-semibold text-accent">
                  {pct}% captured
                </span>
              </div>
              <div className="mt-3 flex items-end gap-3">
                <span className="tabular font-mono text-[52px] font-semibold leading-none tracking-[-0.03em] text-ink">
                  {usd(captured)}
                </span>
                <span className="mb-1 text-[15px] font-semibold text-accent">
                  of {usd(total)} total
                </span>
              </div>
              <div className="mt-1.5 text-[13.5px] text-secondary">
                across {cards.length} cards · {netStr(net)} beyond {usd(fees)} in
                annual fees
              </div>
              <div className="mt-4">
                <ProgressBar pct={pct} />
              </div>
            </Panel>

            <Panel className="pb-2">
              <ListHeader title="Use before they reset" linkLabel="See all →" href="/app/expiring" />
              <div>
                {expiring.map((c) => (
                  <ResetRow key={c.id} credit={c} tileSize={46} onToggle={() => markUsed(c.id)} />
                ))}
              </div>
            </Panel>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-[14px]">
              <StatTile
                icon={<ChecklistIcon size={19} />}
                figure={usd(remainMonth)}
                caption="left this month"
              />
              <StatTile
                icon={<ClockIcon size={19} />}
                figure={usd(atRisk)}
                caption="expiring ≤7 days"
                iconTone="warning"
                figureColor="var(--ob-warning)"
              />
            </div>

            <Panel className="pb-2">
              <ListHeader title="Your wallet" linkLabel="Manage →" href="/app/cards" />
              <div>
                {cards.map((card) => (
                  <WalletRow key={card.id} card={card} />
                ))}
              </div>
            </Panel>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Stat row of 4 */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-[18px] bg-accent p-[18px] text-on-accent shadow-ob-sm">
              <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] opacity-80">
                Captured 2026
              </div>
              <div className="tabular mt-1.5 font-mono text-[32px] font-semibold tracking-[-0.02em]">
                {usd(captured)}
              </div>
            </div>
            {[
              { label: "Net vs fees", value: netStr(net) },
              { label: "This month", value: usd(remainMonth) },
              { label: "At risk ≤7d", value: usd(atRisk) },
            ].map((s) => (
              <div key={s.label} className="rounded-[18px] border border-border bg-surface p-[18px] shadow-ob-sm">
                <MonoLabel>{s.label}</MonoLabel>
                <div className="tabular mt-1.5 font-mono text-[32px] font-semibold tracking-[-0.02em] text-ink">
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Two columns */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Panel className="pb-2">
              <ListHeader title="Use before they reset" linkLabel="See all →" href="/app/expiring" />
              <div>
                {expiring.map((c) => (
                  <ResetRow key={c.id} credit={c} tileSize={42} onToggle={() => markUsed(c.id)} />
                ))}
              </div>
            </Panel>
            <Panel className="pb-2">
              <ListHeader title="Your wallet" linkLabel="Manage →" href="/app/cards" />
              <div>
                {cards.map((card) => (
                  <WalletRow key={card.id} card={card} />
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
