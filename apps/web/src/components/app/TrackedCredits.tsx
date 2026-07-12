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

type TrackedCredit = {
  id: Id<"userBenefits">;
  title: string;
  amount: number;
  cycle: Cycle;
  usedAmount: number;
};

type Suggestion = {
  benefitTitle: string;
  title: string;
  amount: number;
  cycle: Cycle;
  confidence: "high" | "medium";
};

// One row per credit — tracked or merely suggested — with the track/untrack
// (and inline amount/cycle edit) controls in the same row. A suggestion that's
// already tracked collapses into its tracked row, so nothing shows twice.
function CreditRow({
  tracked,
  suggestion,
  userCardId,
}: {
  tracked: TrackedCredit | null;
  suggestion: Suggestion | null;
  userCardId: Id<"userCards">;
}) {
  const track = useMutation(api.benefits.trackBenefit);
  const update = useMutation(api.benefits.updateBenefit);
  const untrack = useMutation(api.benefits.untrackBenefit);

  // Seed the editable fields from whichever source drives this row.
  const seed = tracked ?? suggestion!;
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(seed.amount));
  const [cycle, setCycle] = useState<Cycle>(seed.cycle);
  const [busy, setBusy] = useState(false);

  const title = seed.title;

  const onTrack = async () => {
    if (!suggestion) return;
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
      setEditing(false);
    } catch (e) {
      console.error("trackBenefit failed", e);
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    if (!tracked) return;
    const n = parseFloat(amount);
    if (!(n > 0)) return;
    setBusy(true);
    try {
      await update({ userBenefitId: tracked.id, amount: n, cycle });
      setEditing(false);
    } catch (e) {
      console.error("updateBenefit failed", e);
    } finally {
      setBusy(false);
    }
  };

  const onUntrack = () => {
    if (!tracked) return;
    void untrack({ userBenefitId: tracked.id });
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-ink">{title}</p>
          {tracked ? (
            <p className="mt-0.5 text-[12.5px] text-secondary">
              {usd(tracked.amount)} / {CYCLE_LABEL[tracked.cycle]} ·{" "}
              {usd(Math.min(tracked.usedAmount, tracked.amount))} used this period
            </p>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <Pill tone="accent">
                {usd(suggestion!.amount)} / {CYCLE_LABEL[suggestion!.cycle]}
              </Pill>
              {suggestion!.confidence === "medium" && (
                <span className="text-[11px] text-tertiary">check amount</span>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="text-[13px] font-semibold text-secondary hover:text-ink"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
          {tracked ? (
            <button
              type="button"
              onClick={onUntrack}
              className="text-[13px] font-semibold text-alert hover:underline"
            >
              Untrack
            </button>
          ) : (
            <Button onClick={onTrack} disabled={busy}>
              Track
            </Button>
          )}
        </div>
      </div>
      {editing && (
        <div className="flex items-center gap-2 pl-1">
          <AmountInput value={amount} onChange={setAmount} />
          <CycleSelect value={cycle} onChange={setCycle} />
          {tracked && (
            <Button onClick={onSave} disabled={busy}>
              Save
            </Button>
          )}
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

  // Merge into ONE list: a suggestion that's already tracked (matched by title,
  // which trackBenefit copies verbatim) collapses into its tracked row. Rows
  // follow the card's natural suggestion order; manual / unmatched tracked
  // credits (no suggestion) come after.
  const byTitle = new Map<string, TrackedCredit>(
    tracked.map((c) => [
      c.title,
      { id: c.id, title: c.title, amount: c.amount, cycle: c.cycle, usedAmount: c.usedAmount },
    ]),
  );

  type Row = {
    key: string;
    tracked: TrackedCredit | null;
    suggestion: Suggestion | null;
  };
  const rows: Row[] = [];
  const matched = new Set<string>();
  for (const s of suggestions ?? []) {
    const tc = byTitle.get(s.title) ?? null;
    if (tc) matched.add(tc.id);
    rows.push({ key: `s:${s.benefitTitle}`, tracked: tc, suggestion: s });
  }
  for (const tc of byTitle.values()) {
    if (matched.has(tc.id)) continue;
    rows.push({ key: `t:${tc.id}`, tracked: tc, suggestion: null });
  }

  return (
    <Card className="mt-6">
      <SectionLabel>Credits</SectionLabel>

      {suggestions === undefined ? (
        <p className="py-2 text-[13px] text-tertiary">Loading credits…</p>
      ) : rows.length === 0 ? (
        <p className="py-2 text-[13px] text-tertiary">
          No credit-like benefits detected on this card. Add one manually below.
        </p>
      ) : (
        <div>
          {rows.map((r) => (
            <CreditRow
              key={r.key}
              tracked={r.tracked}
              suggestion={r.suggestion}
              userCardId={userCardId}
            />
          ))}
        </div>
      )}

      <ManualAdd userCardId={userCardId} />
    </Card>
  );
}
