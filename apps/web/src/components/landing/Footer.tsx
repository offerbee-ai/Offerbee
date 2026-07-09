import Link from "next/link";
import { BrandMark } from "./BrandMark";

const columns = [
  {
    label: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "How it works", href: "#how" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    label: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms & Conditions", href: "/terms" },
    ],
  },
];

export function Footer() {
  return (
    <div className="mt-24 border-t border-border">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-start justify-between gap-8 px-6 py-12 md:px-10">
        <div className="max-w-[22em]">
          <BrandMark size={28} wordSize={19} gid="foot" />
          <p className="mt-[14px] text-[14px] leading-[1.6] text-muted">
            Keep more of what your cards already promised. Made for people who
            read the fine print.
          </p>
        </div>
        <div className="flex gap-16">
          {columns.map((col) => (
            <div
              key={col.label}
              className="flex flex-col gap-[11px] text-[14.5px] text-body"
            >
              <span className="mb-[3px] font-mono text-[11px] font-semibold uppercase tracking-[.08em] text-tertiary">
                {col.label}
              </span>
              {col.links.map((l) =>
                l.href.startsWith("/") ? (
                  <Link
                    key={l.label}
                    href={l.href}
                    className="transition-colors hover:text-accent"
                  >
                    {l.label}
                  </Link>
                ) : (
                  <a
                    key={l.label}
                    href={l.href}
                    className="transition-colors hover:text-accent"
                  >
                    {l.label}
                  </a>
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-[1200px] px-6 pb-10 text-[13px] text-tertiary md:px-10">
        © 2026 OfferBee.ai · Not affiliated with any card issuer. Card names are
        trademarks of their respective owners.
      </div>
    </div>
  );
}
