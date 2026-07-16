"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { ONBOARDING_CARDS } from "@packages/backend/convex/onboardingCatalog";
import { cn } from "@/lib/utils";

const feeStr = (fee: number) => (fee > 0 ? `$${fee}/yr` : "No annual fee");
const creditsStr = (credits: number) =>
  `$${credits.toLocaleString("en-US")} value`;

type CardArt = { imageUrl: string | null; annualFee: number | null };

function CheckIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** Step 2 — pick cards from the curated catalog. No bank login, ever. */
export function StepWallet({
  selected,
  onToggle,
}: {
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  // Real card art + annual fee, keyed by cardKey (pre-warmed cardDetails).
  // undefined while loading / when signed out → we fall back to the brand
  // color chip + the catalog's static fee.
  const art = useQuery(api.catalog.onboardingCardArt) as
    | Record<string, CardArt>
    | undefined;

  const q = search.trim().toLowerCase();
  const results = q
    ? ONBOARDING_CARDS.filter(
        (c) =>
          c.name.toLowerCase().includes(q) || c.issuer.toLowerCase().includes(q),
      )
    : [];
  const popular = ONBOARDING_CARDS.filter((c) => c.popular);

  return (
    <div>
      <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.07em] text-tertiary">
        Step 02 · Your wallet
      </div>
      <h1 className="mt-[10px] font-display text-[26px] font-semibold tracking-[-0.02em] lg:text-[32px]">
        Which cards are in your wallet?
      </h1>
      <p className="mb-[22px] mt-[10px] text-[15px] leading-[1.5] text-secondary">
        Tap the ones you carry. Start with the popular picks, or search 65+
        cards — we track every credit for you.
      </p>

      <div className="grid max-w-[1080px] grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-[14px]">
        {popular.map((c) => {
          const on = selected.has(c.id);
          const image = art?.[c.cardKey]?.imageUrl ?? null;
          const fee = art?.[c.cardKey]?.annualFee ?? c.fee;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(c.id)}
              className={cn(
                "rounded-[14px] border bg-surface p-3 text-left transition-[box-shadow,border-color] duration-150",
                on
                  ? "border-accent shadow-[0_0_0_3px_var(--ob-accent-soft)]"
                  : "border-border shadow-ob-sm hover:border-tertiary",
              )}
            >
              <div
                className="relative aspect-[1.586] overflow-hidden rounded-[10px]"
                style={{ background: c.color }}
              >
                {image ? (
                  // Plain <img>: the card-image host path rotates (see wallet page).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <>
                    <div className="absolute inset-0 bg-[linear-gradient(140deg,rgba(255,255,255,.16),rgba(0,0,0,.2))]" />
                    <div className="absolute left-3 top-3 h-[18px] w-[26px] rounded-[4px] bg-white/30" />
                  </>
                )}
                {on && (
                  <div className="absolute right-[9px] top-[9px] flex size-6 items-center justify-center rounded-full bg-accent text-white">
                    <CheckIcon />
                  </div>
                )}
              </div>
              <div className="mt-[10px] text-[14px] font-semibold">{c.name}</div>
              <div className="mt-px text-[12px] text-secondary">
                {feeStr(fee)} · {creditsStr(c.credits)}
              </div>
            </button>
          );
        })}
      </div>

      <div className="relative mt-[22px] max-w-[1080px]">
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ob-tertiary)"
          strokeWidth="2"
          strokeLinecap="round"
          className="pointer-events-none absolute left-[15px] top-1/2 -translate-y-1/2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Chase, Citi, Capital One…"
          aria-label="Search cards"
          className="w-full rounded-[12px] border border-border bg-surface py-[13px] pl-[42px] pr-[14px] text-[14.5px] text-ink outline-none placeholder:text-tertiary focus:border-accent"
        />
      </div>

      {q.length > 0 && (
        <div className="mt-[14px] max-w-[1080px] overflow-hidden rounded-[14px] border border-border bg-surface">
          <div className="px-4 pb-1 pt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-tertiary">
            Search results
          </div>
          {results.map((c) => {
            const on = selected.has(c.id);
            const image = art?.[c.cardKey]?.imageUrl ?? null;
            const fee = art?.[c.cardKey]?.annualFee ?? c.fee;
            return (
              <div
                key={c.id}
                className="flex items-center gap-3 border-t border-separator px-4 py-[13px]"
              >
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt=""
                    className="h-[23px] w-[34px] shrink-0 rounded-[5px] object-cover"
                  />
                ) : (
                  <span
                    className="block h-[23px] w-[34px] shrink-0 rounded-[5px]"
                    style={{ background: c.color }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold">{c.name}</div>
                  <div className="text-[12px] text-secondary">
                    {c.issuer} · {feeStr(fee)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onToggle(c.id)}
                  className={cn(
                    "whitespace-nowrap rounded-[9px] text-[12.5px] font-semibold transition-colors",
                    on
                      ? "bg-accent-soft px-[13px] py-[7px] text-accent"
                      : "bg-accent px-[14px] py-[7px] text-on-accent hover:bg-accent-strong",
                  )}
                >
                  {on ? "Added" : "Add"}
                </button>
              </div>
            );
          })}
          {results.length === 0 && (
            <div className="border-t border-separator p-4 text-[13.5px] text-tertiary">
              No cards match — try an issuer name.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
