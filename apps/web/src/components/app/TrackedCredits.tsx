"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { Button, Card, Pill, SectionLabel } from "./ui";
import { CYCLE_LABEL, usd, type Cycle } from "./data";

const CYCLES: Cycle[] = ["monthly", "quarterly", "semiannual", "annual"];

function CycleSelect({
  value,
  onChange,
}: {
  value: Cycle;
  onChange: (c: Cycle) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Cycle)}
      className="rounded-button border border-border bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
    >
      {CYCLES.map((c) => (
        <option key={c} value={c}>
          {CYCLE_LABEL[c]}
        </option>
      ))}
    </select>
  );
}

function AmountInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min="0"
      step="0.01"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="$"
      className="w-[80px] rounded-button border border-border bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
    />
  );
}

// A row for a parsed suggestion: track directly, or expand to adjust first.
function SuggestionRow({
  suggestion,
  userCardId,
}: {
  suggestion: {
    benefitTitle: string;
    title: string;
    amount: number;
    cycle: Cycle;
    confidence: "high" | "medium";
    alreadyTracked: boolean;
  };
  userCardId: Id<"userCards">;
}) {
  const track = useMutation(api.benefits.trackBenefit);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(suggestion.amount));
  const [cycle, setCycle] = useState<Cycle>(suggestion.cycle);
  const [busy, setBusy] = useState(false);

  const onTrack = async () => {
    const n = parseFloat(amount);
    if (!(n > 0)) return;
    setBusy(true);
    try {
      await track({
        userCardId,
        title: suggestion.title,
        amount: n,
        cycle,
        source: "suggested",
        benefitTitle: suggestion.benefitTitle,
      });
    } catch (e) {
      console.error("trackBenefit failed", e);
    } finally {
      setBusy(false);
      setEditing(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-ink">
            {suggestion.title}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Pill tone="accent">
              {usd(suggestion.amount)} / {CYCLE_LABEL[suggestion.cycle]}
            </Pill>
            {suggestion.confidence === "medium" && (
              <span className="text-[11px] text-tertiary">check amount</span>
            )}
          </div>
        </div>
        {suggestion.alreadyTracked ? (
          <Button variant="secondary" disabled>
            Tracked ✓
          </Button>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="text-[13px] font-semibold text-secondary hover:text-ink"
            >
              Edit
            </button>
            <Button onClick={onTrack} disabled={busy}>
              Track
            </Button>
          </div>
        )}
      </div>
      {editing && !suggestion.alreadyTracked && (
        <div className="flex items-center gap-2 pl-1">
          <AmountInput value={amount} onChange={setAmount} />
          <CycleSelect value={cycle} onChange={setCycle} />
        </div>
      )}
    </div>
  );
}

// A row for an already-tracked credit: inline edit amount/cycle, or untrack.
function TrackedRow({
  credit,
}: {
  credit: {
    id: Id<"userBenefits">;
    title: string;
    amount: number;
    cycle: Cycle;
    usedAmount: number;
  };
}) {
  const update = useMutation(api.benefits.updateBenefit);
  const untrack = useMutation(api.benefits.untrackBenefit);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(credit.amount));
  const [cycle, setCycle] = useState<Cycle>(credit.cycle);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const n = parseFloat(amount);
    if (!(n > 0)) return;
    setBusy(true);
    try {
      await update({ userBenefitId: credit.id, amount: n, cycle });
    } catch (e) {
      console.error("updateBenefit failed", e);
    } finally {
      setBusy(false);
      setEditing(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-ink">
            {credit.title}
          </p>
          <p className="mt-0.5 text-[12.5px] text-secondary">
            {usd(credit.amount)} / {CYCLE_LABEL[credit.cycle]} ·{" "}
            {usd(Math.min(credit.usedAmount, credit.amount))} used this period
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="text-[13px] font-semibold text-secondary hover:text-ink"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
          <button
            type="button"
            onClick={() => untrack({ userBenefitId: credit.id })}
            className="text-[13px] font-semibold text-alert hover:underline"
          >
            Untrack
          </button>
        </div>
      </div>
      {editing && (
        <div className="flex items-center gap-2 pl-1">
          <AmountInput value={amount} onChange={setAmount} />
          <CycleSelect value={cycle} onChange={setCycle} />
          <Button onClick={save} disabled={busy}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

function ManualAdd({ userCardId }: { userCardId: Id<"userCards"> }) {
  const track = useMutation(api.benefits.trackBenefit);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const n = parseFloat(amount);
    if (!title.trim() || !(n > 0)) return;
    setBusy(true);
    try {
      await track({ userCardId, title: title.trim(), amount: n, cycle, source: "manual" });
      setTitle("");
      setAmount("");
      setCycle("monthly");
      setOpen(false);
    } catch (e) {
      console.error("trackBenefit failed", e);
    } finally {
      setBusy(false);
    }
  };

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-[13px] font-semibold text-accent hover:underline"
      >
        + Add a credit manually
      </button>
    );

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Credit name"
        className="min-w-[160px] flex-1 rounded-button border border-border bg-surface px-3 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
      />
      <AmountInput value={amount} onChange={setAmount} />
      <CycleSelect value={cycle} onChange={setCycle} />
      <Button onClick={add} disabled={busy}>
        Add
      </Button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-[13px] font-semibold text-secondary hover:text-ink"
      >
        Cancel
      </button>
    </div>
  );
}

export function TrackedCredits({
  cardKey,
  userCardId,
}: {
  cardKey: string;
  userCardId: Id<"userCards">;
}) {
  const suggestions = useQuery(api.benefits.suggestionsForCard, { cardKey });
  const data = useQuery(api.benefits.listMyCredits);
  const tracked = (data?.credits ?? []).filter((c) => c.cardKey === cardKey);

  return (
    <Card className="mt-6">
      <SectionLabel>Tracked credits</SectionLabel>

      {tracked.length > 0 && (
        <div className="mb-2">
          {tracked.map((c) => (
            <TrackedRow
              key={c.id}
              credit={{
                id: c.id,
                title: c.title,
                amount: c.amount,
                cycle: c.cycle,
                usedAmount: c.usedAmount,
              }}
            />
          ))}
        </div>
      )}

      {suggestions === undefined ? (
        <p className="py-2 text-[13px] text-tertiary">Loading suggestions…</p>
      ) : suggestions.length === 0 ? (
        tracked.length === 0 && (
          <p className="py-2 text-[13px] text-tertiary">
            No credit-like benefits detected on this card. Add one manually below.
          </p>
        )
      ) : (
        <>
          <p className="mb-1 mt-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-tertiary">
            Suggested from this card
          </p>
          {suggestions.map((s) => (
            <SuggestionRow key={s.benefitTitle} suggestion={s} userCardId={userCardId} />
          ))}
        </>
      )}

      <ManualAdd userCardId={userCardId} />
    </Card>
  );
}
