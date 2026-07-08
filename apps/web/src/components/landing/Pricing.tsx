import Link from "next/link";
import { CheckIcon } from "./icons";

function Feature({ children, color }: { children: string; color: string }) {
  return (
    <div className="flex gap-[10px] text-[15px]">
      <CheckIcon
        size={18}
        strokeWidth={2.2}
        className="shrink-0"
        style={{ color }}
      />
      {children}
    </div>
  );
}

export function Pricing() {
  return (
    <div id="pricing" className="mx-auto max-w-[1200px] px-6 pt-24 text-center md:px-10">
      <div className="font-mono text-[12.5px] font-semibold uppercase tracking-[.1em] text-accent">
        Pricing
      </div>
      <h2 className="mt-[14px] font-display text-[34px] font-semibold tracking-[-.02em] sm:text-[42px]">
        Pays for itself in one credit
      </h2>

      <div className="mx-auto mt-11 grid max-w-[760px] gap-6 text-left md:grid-cols-2">
        {/* Free */}
        <div className="rounded-[22px] border border-border bg-surface p-8">
          <div className="text-[15px] font-semibold text-secondary">Free</div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="font-mono text-[40px] font-semibold">$0</span>
          </div>
          <div className="mt-0.5 text-[14px] text-muted">Up to 2 cards</div>
          <div className="my-5 h-px bg-separator" />
          <div className="flex flex-col gap-[11px] text-ink-soft">
            <Feature color="var(--ob-accent)">Credit tracking &amp; resets</Feature>
            <Feature color="var(--ob-accent)">Expiry reminders</Feature>
          </div>
          <Link
            href="/notes"
            className="mt-6 block rounded-xl border border-[#DAD2C2] bg-background py-3 text-center text-[15px] font-semibold text-ink transition-colors hover:border-accent"
          >
            Start free
          </Link>
        </div>

        {/* Pro (fixed dark card — content, not themed) */}
        <div className="relative rounded-[22px] bg-[#211D16] p-8 text-[#F5F1E9]">
          <div className="absolute right-5 top-5 rounded-[7px] bg-accent px-[9px] py-[5px] font-mono text-[11px] font-semibold tracking-[.06em] text-white">
            POPULAR
          </div>
          <div className="text-[15px] font-semibold text-[#C9C0AE]">Pro</div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="font-mono text-[40px] font-semibold">$4</span>
            <span className="text-[15px] text-[#A69C86]">/mo</span>
          </div>
          <div className="mt-0.5 text-[14px] text-[#A69C86]">Unlimited cards</div>
          <div className="my-5 h-px bg-white/10" />
          <div className="flex flex-col gap-[11px] text-[#E8E1D2]">
            <Feature color="#F0A85C">Everything in Free</Feature>
            <Feature color="#F0A85C">Fee-vs-value verdicts</Feature>
            <Feature color="#F0A85C">CSV import &amp; export</Feature>
          </div>
          <Link
            href="/notes"
            className="mt-6 block rounded-xl bg-accent py-3 text-center text-[15px] font-semibold text-white transition-colors hover:bg-accent-strong"
          >
            Get OfferBee Pro
          </Link>
        </div>
      </div>
    </div>
  );
}
