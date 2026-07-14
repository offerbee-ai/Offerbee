"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { usd } from "./data";
import { Panel } from "./controls";

// "Detected" — Plaid transactions matched to a tracked credit at medium
// confidence, awaiting the user's confirm/dismiss. (High-confidence matches are
// auto-logged and appear directly on the credit.)
export function DetectedCredits() {
  const suggestions = useQuery(api.plaid.listSuggestions);
  const confirm = useMutation(api.plaid.confirmSuggestion);
  const dismiss = useMutation(api.plaid.dismissSuggestion);
  const [pending, setPending] = useState<Set<string>>(new Set());

  if (!suggestions || suggestions.length === 0) return null;

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setPending((p) => new Set(p).add(id));
    try {
      await fn();
    } catch (e) {
      console.error("suggestion action failed", e);
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="font-display text-[19px] font-semibold text-ink">Detected</h2>
        <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-accent">
          {suggestions.length}
        </span>
      </div>

      <Panel className="overflow-hidden">
        {suggestions.map((s) => {
          const busy = pending.has(s.transactionId);
          return (
            <div
              key={s.transactionId}
              className="flex flex-wrap items-center gap-3 border-t border-separator px-4 py-4 first:border-t-0 sm:px-5"
            >
              <span className="text-[16px]" aria-hidden>
                ⚡
              </span>
              <div className="min-w-0 flex-1 basis-[160px]">
                <div className="truncate text-[14.5px] font-semibold text-ink">
                  {usd(s.amount)} at {s.merchantName}
                </div>
                <div className="truncate text-[12.5px] text-secondary">
                  {new Date(s.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                  {s.benefitTitle ? ` · ${s.benefitTitle}` : ""}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(s.transactionId, () =>
                      confirm({ transactionId: s.transactionId }),
                    )
                  }
                  className="rounded-[9px] bg-accent px-[13px] py-[7px] text-[12.5px] font-semibold text-on-accent transition-colors hover:bg-accent-strong disabled:opacity-50"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(s.transactionId, () =>
                      dismiss({ transactionId: s.transactionId }),
                    )
                  }
                  className="rounded-[9px] border border-border px-[13px] py-[7px] text-[12.5px] font-semibold text-secondary transition-colors hover:text-ink disabled:opacity-50"
                >
                  Dismiss
                </button>
              </div>
            </div>
          );
        })}
      </Panel>
    </section>
  );
}
