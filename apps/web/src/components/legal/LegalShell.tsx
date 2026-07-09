import Link from "next/link";
import { BrandMark } from "@/components/landing/BrandMark";
import { Footer } from "@/components/landing/Footer";

/**
 * Shared chrome + typography for the standalone legal pages
 * (Terms & Conditions, Privacy Policy). Renders a slim header with the
 * OfferBee mark linking home, a readable prose column, and the shared footer.
 */
export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background text-ink">
      <div className="sticky top-0 z-50 border-b border-border bg-glass backdrop-blur-[16px] backdrop-saturate-150">
        <div className="mx-auto flex max-w-[820px] items-center justify-between px-6 py-4 md:px-8">
          <Link href="/" aria-label="OfferBee home">
            <BrandMark gid="legal-nav" />
          </Link>
          <Link
            href="/"
            className="text-[14.5px] font-semibold text-ink transition-colors hover:text-accent"
          >
            ← Back to home
          </Link>
        </div>
      </div>

      <article className="mx-auto max-w-[720px] px-6 pb-8 pt-14 md:px-8">
        <p className="font-mono text-[12px] font-semibold uppercase tracking-[.1em] text-accent">
          OfferBee.ai
        </p>
        <h1 className="mt-3 font-display text-[34px] font-semibold tracking-[-.02em] sm:text-[42px]">
          {title}
        </h1>
        <p className="mt-3 text-[14px] text-tertiary">Last updated: {updated}</p>

        <div className="legal-body mt-10">{children}</div>
      </article>

      <Footer />
    </main>
  );
}

/** A numbered/labelled top-level section heading. */
export function Section({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-11 font-display text-[24px] font-semibold tracking-[-.01em] text-ink first:mt-0">
      {children}
    </h2>
  );
}

/** A secondary heading within a section. */
export function SubSection({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-7 text-[16px] font-semibold text-ink-soft">{children}</h3>
  );
}

/** Body paragraph. */
export function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 text-[16px] leading-[1.7] text-body">{children}</p>
  );
}

/** Bulleted list. */
export function List({ children }: { children: React.ReactNode }) {
  return (
    <ul className="mt-4 flex list-disc flex-col gap-2 pl-6 text-[16px] leading-[1.7] text-body marker:text-accent">
      {children}
    </ul>
  );
}
