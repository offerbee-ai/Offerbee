"use client";

import { useMemo, useState } from "react";
import {
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { Button, Card, EmptyState, Pill, Spinner } from "@/components/app/ui";

type Scalar = number | string | boolean | undefined;

const FIELD_LABELS: Record<string, string> = {
  annualFee: "Annual fee",
  fxFee: "Foreign transaction fee",
  signupBonusAmount: "Signup bonus",
  signupBonusSpend: "Min. spend",
  signupBonusLength: "Bonus window",
  signupBonusLengthPeriod: "Bonus window unit",
  signupBonusDesc: "Bonus description",
  cardUrl: "Official page",
  spendBonusCategory: "Earn category",
  benefit: "Benefit",
};

const CHANGE_LABEL: Record<string, string> = {
  add: "Add",
  remove: "Remove",
  patch: "Change",
};
const CHANGE_TONE: Record<string, "accent" | "warning" | "neutral"> = {
  add: "accent",
  remove: "warning",
  patch: "neutral",
};

function fmtScalar(field: string, value: Scalar) {
  if (value === undefined || value === null) return "—";
  if (field === "annualFee" || field === "signupBonusSpend")
    return `$${Number(value).toLocaleString()}`;
  if (field === "fxFee") return `${Number(value)}%`;
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

function truncate(s: string, n = 140) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

// Human-readable one-liner for an array item (category or benefit).
function itemSummary(field: string, item: any): string {
  if (!item) return "—";
  if (field === "spendBonusCategory") {
    const parts: string[] = [];
    if (item.earnMultiplier != null) parts.push(`${item.earnMultiplier}x`);
    if (item.spendLimit) parts.push(`$${Number(item.spendLimit).toLocaleString()} cap`);
    const head = parts.join(" · ");
    const desc = item.spendBonusDesc ? truncate(String(item.spendBonusDesc)) : "";
    return [head, desc].filter(Boolean).join(" — ") || "—";
  }
  if (field === "benefit") {
    return item.benefitDesc ? truncate(String(item.benefitDesc)) : "—";
  }
  return truncate(String(item));
}

export default function ReviewPage() {
  const amAdmin = useQuery(api.review.amIAdmin);
  const reviews = useQuery(api.review.listPendingReviews);
  const pendingCount = useQuery(api.review.pendingReviewCount);
  const confirm = useMutation(api.review.confirmReview);
  const reject = useMutation(api.review.rejectReview);
  const autoConfirm = useMutation(api.review.confirmHighConfidence);
  const [autoBusy, setAutoBusy] = useState(false);
  const startVerify = useAction(api.freshness.verifyMyWallet);
  const [busy, setBusy] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [view, setView] = useState<"queue" | "history">("queue");

  // Group pending findings by card.
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { cardKey: string; cardName: string; cardIssuer: string | null; rows: any[] }
    >();
    for (const r of reviews ?? []) {
      const g = map.get(r.cardKey) ?? {
        cardKey: r.cardKey,
        cardName: r.cardName,
        cardIssuer: r.cardIssuer ?? null,
        rows: [],
      };
      g.rows.push(r);
      map.set(r.cardKey, g);
    }
    return [...map.values()].sort((a, b) => b.rows.length - a.rows.length);
  }, [reviews]);

  const runVerification = async () => {
    setRunning(true);
    setRunMsg(null);
    try {
      const { cardCount } = await startVerify({});
      setRunMsg(
        cardCount === 0
          ? "No cards in your wallet to verify yet."
          : `Verified ${cardCount} card${cardCount === 1 ? "" : "s"} — findings below.`,
      );
    } catch (e) {
      console.error("verification run failed", e);
      setRunMsg("Couldn't start verification. Check the logs.");
    } finally {
      setRunning(false);
    }
  };

  const runAutoConfirm = async () => {
    if (
      !window.confirm(
        "Auto-confirm every pending finding at ≥90% confidence? This writes them straight to card data (removals are never auto-confirmed).",
      )
    )
      return;
    setAutoBusy(true);
    try {
      // The mutation scans a bounded page per call (Convex limits); loop until
      // the queue is drained, with a safety cap on iterations.
      let applied = 0;
      let stale = 0;
      for (let i = 0; i < 10; i++) {
        const res = await autoConfirm({});
        applied += res.applied;
        stale += res.stale;
        // Stop when the queue is drained OR a full scan moved nothing — the
        // scan is deterministic oldest-first, so a no-op pass would just
        // re-read the same below-threshold/uncited rows forever.
        if (!res.more || res.applied + res.stale === 0) break;
        setRunMsg(`Auto-confirming… ${applied} applied so far.`);
      }
      setRunMsg(
        `Auto-confirmed ${applied} finding${applied === 1 ? "" : "s"} at ≥90% confidence` +
          (stale > 0 ? ` (${stale} skipped as stale — data had moved on).` : "."),
      );
    } catch (e) {
      console.error("auto-confirm failed", e);
      setRunMsg("Auto-confirm failed. Check the logs.");
    } finally {
      setAutoBusy(false);
    }
  };

  const RunButton = (
    <Button onClick={runVerification} disabled={running || autoBusy}>
      {running ? "Verifying…" : "Run verification"}
    </Button>
  );

  // Shown while a manual verification run is in flight (the action awaits every
  // card, so this stays up for the whole run).
  const VerifyingBanner = running ? (
    <div className="mb-4 flex items-center gap-3 rounded-card border border-hairline bg-field px-4 py-3">
      <Spinner />
      <span className="text-[14px] text-body">
        Verifying your wallet against the web — this can take a moment per card.
        Findings will appear here when it finishes.
      </span>
    </div>
  ) : null;

  if (amAdmin === undefined || reviews === undefined)
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );

  if (!amAdmin)
    return (
      <EmptyState
        title="Admins only"
        description="Data review and verification are restricted to administrators."
      />
    );

  const ViewToggle = (
    <div className="flex rounded-full border border-hairline bg-field p-0.5">
      {(["queue", "history"] as const).map((k) => (
        <button
          key={k}
          onClick={() => setView(k)}
          className={`rounded-full px-3 py-1 text-[13px] font-medium transition ${
            view === k ? "bg-accent text-white" : "text-body hover:text-ink"
          }`}
        >
          {k === "queue" ? "Queue" : "History"}
        </button>
      ))}
    </div>
  );

  if (view === "history")
    return (
      <div>
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="font-display text-[28px] font-semibold text-ink">
            Data review
          </h1>
          {ViewToggle}
        </div>
        <HistoryView />
      </div>
    );

  if (reviews.length === 0)
    return (
      <div>
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="font-display text-[28px] font-semibold text-ink">
            Data review
          </h1>
          <div className="flex items-center gap-3">
            {ViewToggle}
            {RunButton}
          </div>
        </div>
        {runMsg && <p className="mb-6 text-[14px] text-body">{runMsg}</p>}
        {VerifyingBanner}
        <EmptyState
          title="Nothing to review"
          description="Run a verification to web-check your cards against the issuer. Anything that differs shows up here, grouped by card, for one-click review."
          action={RunButton}
        />
      </div>
    );

  const current =
    groups.find((g) => g.cardKey === activeCard) ?? groups[0];

  // Within a card, order findings: changes/adds first, removals last.
  const ordered = [...current.rows].sort((a, b) => {
    const rank = (r: any) => (r.changeType === "remove" ? 1 : 0);
    return rank(a) - rank(b);
  });

  const act = async (
    fn: typeof confirm | typeof reject,
    id: Id<"cardDataReview">,
    tag: string,
  ) => {
    setBusy(tag);
    try {
      const res = await fn({ reviewId: id });
      if (res && res.stale) {
        setRunMsg(
          "Card data changed since this proposal — the finding was marked stale instead of applied.",
        );
      }
    } catch (e) {
      console.error("review action failed", e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h1 className="font-display text-[28px] font-semibold text-ink">
          Data review
        </h1>
        <div className="flex items-center gap-3">
          {ViewToggle}
          <Pill tone="warning">
            {(pendingCount ?? reviews.length) > 200
              ? "200+"
              : (pendingCount ?? reviews.length)}{" "}
            pending
          </Pill>
          <Button
            variant="secondary"
            onClick={runAutoConfirm}
            disabled={autoBusy || running}
          >
            {autoBusy ? "Confirming…" : "Auto-confirm ≥90%"}
          </Button>
          {RunButton}
        </div>
      </div>
      <p className="mb-4 max-w-[60ch] text-[14px] text-body">
        Findings from web-checking each card against the issuer, grouped by card.
        Review each one — confirm to write it, keep current to dismiss.
      </p>
      {runMsg && <p className="mb-4 text-[13px] text-secondary">{runMsg}</p>}
      {VerifyingBanner}

      {/* Card tabs */}
      <div className="mb-5 flex flex-wrap gap-2">
        {groups.map((g) => {
          const isActive = g.cardKey === current.cardKey;
          return (
            <button
              key={g.cardKey}
              onClick={() => setActiveCard(g.cardKey)}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
                isActive
                  ? "border-accent bg-accent text-white"
                  : "border-hairline bg-field text-body hover:border-accent/40"
              }`}
            >
              {g.cardName}
              <span
                className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] ${
                  isActive ? "bg-white/20" : "bg-white text-tertiary"
                }`}
              >
                {g.rows.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Findings for the active card */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <p className="font-semibold text-ink">{current.cardName}</p>
          <p className="text-[13px] text-secondary">
            {current.cardIssuer ?? current.cardKey}
          </p>
        </div>

        {ordered.map((r) => {
          const confirmTag = `${r._id}:confirm`;
          const rejectTag = `${r._id}:reject`;
          const isItem = !!r.changeType;
          const removing = r.changeType === "remove";
          return (
            <Card key={r._id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  {isItem && (
                    <Pill tone={CHANGE_TONE[r.changeType] ?? "neutral"}>
                      {CHANGE_LABEL[r.changeType] ?? r.changeType}
                    </Pill>
                  )}
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-tertiary">
                    {FIELD_LABELS[r.field] ?? r.field}
                  </span>
                </div>
                {typeof r.confidence === "number" && (
                  <span className="text-[12px] text-tertiary">
                    {Math.round(r.confidence * 100)}% confidence
                  </span>
                )}
              </div>

              {isItem ? (
                <div className="rounded-card bg-field px-4 py-3">
                  <div className="font-semibold text-ink">{r.itemName}</div>
                  <div className="mt-1 text-[14px]">
                    {removing ? (
                      <span className="text-secondary line-through">
                        {itemSummary(r.field, r.currentValue)}
                      </span>
                    ) : r.changeType === "patch" ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-secondary line-through">
                          {itemSummary(r.field, r.currentValue)}
                        </span>
                        <span className="text-tertiary">→</span>
                        <span className="font-medium text-ink">
                          {itemSummary(r.field, r.proposedValue)}
                        </span>
                      </span>
                    ) : (
                      <span className="font-medium text-ink">
                        {itemSummary(r.field, r.proposedValue)}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-4 rounded-card bg-field px-4 py-3">
                  <div className="flex items-center gap-2 text-[15px]">
                    <span className="text-secondary line-through">
                      {fmtScalar(r.field, r.currentValue as Scalar)}
                    </span>
                    <span className="text-tertiary">→</span>
                    <span className="font-semibold text-ink">
                      {fmtScalar(r.field, r.proposedValue as Scalar)}
                    </span>
                  </div>
                </div>
              )}

              {r.sourceUrl && (
                <p className="text-[13px] text-body">
                  <a
                    href={r.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-accent hover:underline"
                  >
                    source
                  </a>
                </p>
              )}

              <div className="flex gap-2">
                <Button
                  disabled={busy !== null}
                  onClick={() => act(confirm, r._id, confirmTag)}
                >
                  {busy === confirmTag
                    ? "Applying…"
                    : removing
                      ? "Confirm removal"
                      : "Confirm"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => act(reject, r._id, rejectTag)}
                >
                  {busy === rejectTag ? "Keeping…" : "Keep current"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

const MODE_LABEL: Record<string, string> = {
  auto: "Auto-applied",
  shadow: "Shadow",
  suppressed: "Suppressed",
  suspect: "Suspect",
  revert: "Reverted",
};
const MODE_TONE: Record<string, "accent" | "warning" | "neutral"> = {
  auto: "accent",
  shadow: "neutral",
  suppressed: "neutral",
  suspect: "warning",
  revert: "warning",
};

// Audit rows carry array items in the diff's named shape ({ name, ... }) and
// scalars verbatim — render either compactly.
function fmtAuditValue(field: string, value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    const name = typeof v.name === "string" ? v.name : "";
    const bits: string[] = [];
    if (v.multiplier != null) bits.push(`${v.multiplier}x`);
    if (typeof v.desc === "string") bits.push(truncate(v.desc, 80));
    return [name, bits.join(" · ")].filter(Boolean).join(" — ") || "—";
  }
  return fmtScalar(field, value as Scalar);
}

// Pipeline run + audit history with shadow-precision measurement and per-row
// revert for applied changes.
function HistoryView() {
  const runs = useQuery(api.audit.listRecentRuns);
  const precision = useQuery(api.audit.shadowPrecision);
  const {
    results: audits,
    status: auditStatus,
    loadMore,
  } = usePaginatedQuery(api.audit.listAudit, {}, { initialNumItems: 25 });
  const revert = useMutation(api.audit.revertAudit);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const runRevert = async (auditId: Id<"cardDataAudit">) => {
    if (!window.confirm("Revert this change on the live card data?")) return;
    setBusyId(auditId);
    setMsg(null);
    try {
      await revert({ auditId });
      setMsg("Reverted — the previous value is back and pinned as manual.");
    } catch (e: any) {
      console.error("revert failed", e);
      setMsg(e?.message ?? "Revert failed. Check the logs.");
    } finally {
      setBusyId(null);
    }
  };

  if (runs === undefined || precision === undefined)
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );

  const pct =
    precision?.precision != null ? Math.round(precision.precision * 100) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Shadow precision — the go/no-go for enabling AUTO_APPLY_ENABLED */}
      <Card className="flex flex-col gap-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-tertiary">
          Shadow precision
        </p>
        <p className="text-[15px] text-body">
          {precision === null || precision.confirmed + precision.rejected === 0 ? (
            "No reviewer verdicts on gate-passing findings yet — review some findings to measure precision."
          ) : (
            <>
              <span className="font-semibold text-ink">{pct}%</span> of
              would-auto-apply findings confirmed by a reviewer (
              {precision.confirmed} confirmed · {precision.rejected} rejected ·{" "}
              {precision.stale} stale · {precision.pending} pending).
              {" "}Target ≥95% before enabling AUTO_APPLY_ENABLED.
            </>
          )}
        </p>
      </Card>

      {/* Recent runs */}
      <div>
        <p className="mb-2 font-semibold text-ink">Recent runs</p>
        {runs.length === 0 ? (
          <p className="text-[14px] text-secondary">No pipeline runs yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {runs.map((r) => (
              <div
                key={r._id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-card border border-hairline bg-field px-4 py-2 text-[13px] text-body"
              >
                <span className="font-medium text-ink">
                  {new Date(r.startedAt).toLocaleString()}
                </span>
                <Pill tone={r.source === "cron" ? "neutral" : "accent"}>
                  {r.source}
                </Pill>
                <span>{r.scheduled} scheduled</span>
                <span>{r.extracted} extracted</span>
                {r.failed > 0 && (
                  <span className="text-warning">{r.failed} failed</span>
                )}
                <span>{r.autoApplied} auto-applied</span>
                <span>{r.enqueued} queued</span>
                {r.suppressed > 0 && <span>{r.suppressed} suppressed</span>}
                {r.suspect > 0 && (
                  <span className="text-warning">{r.suspect} suspect</span>
                )}
                {r.finishedAt === undefined && <Spinner />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Audit trail */}
      <div>
        <p className="mb-2 font-semibold text-ink">Change history</p>
        {msg && <p className="mb-3 text-[13px] text-secondary">{msg}</p>}
        {audits.length === 0 && auditStatus !== "LoadingFirstPage" ? (
          <p className="text-[14px] text-secondary">No audited changes yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {audits.map((a) => (
              <Card key={a._id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{a.cardName}</span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-tertiary">
                      {FIELD_LABELS[a.field] ?? a.field}
                    </span>
                    <Pill tone={CHANGE_TONE[a.changeType] ?? "neutral"}>
                      {CHANGE_LABEL[a.changeType] ?? a.changeType}
                    </Pill>
                    <Pill tone={MODE_TONE[a.mode] ?? "neutral"}>
                      {MODE_LABEL[a.mode] ?? a.mode}
                    </Pill>
                  </div>
                  <span className="text-[12px] text-tertiary">
                    {new Date(a.appliedAt).toLocaleString()}
                    {typeof a.confidence === "number" &&
                      ` · ${Math.round(a.confidence * 100)}%`}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[14px]">
                  <span className="text-secondary line-through">
                    {fmtAuditValue(a.field, a.before)}
                  </span>
                  <span className="text-tertiary">→</span>
                  <span className="font-medium text-ink">
                    {fmtAuditValue(a.field, a.after)}
                  </span>
                </div>
                {(a.mode === "auto" || a.mode === "revert") && (
                  <div>
                    <Button
                      variant="secondary"
                      disabled={busyId !== null}
                      onClick={() => runRevert(a._id)}
                    >
                      {busyId === a._id ? "Reverting…" : "Revert"}
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
        {auditStatus === "CanLoadMore" && (
          <div className="mt-3">
            <Button variant="secondary" onClick={() => loadMore(25)}>
              Load more
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
