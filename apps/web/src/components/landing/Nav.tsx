import Link from "next/link";
import { BrandMark } from "./BrandMark";
import { NavAuthButtons } from "./AuthButtons";

const links = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how" },
  { label: "Design", href: "#themes" },
  { label: "Pricing", href: "#pricing" },
];

export function Nav() {
  return (
    <div className="sticky top-0 z-50 border-b border-border bg-glass backdrop-blur-[16px] backdrop-saturate-150">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4 md:px-10">
        <Link href="/" aria-label="OfferBee home">
          <BrandMark gid="nav" />
        </Link>

        <div className="hidden items-center gap-9 text-[15px] font-medium text-ink-soft md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-accent">
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <NavAuthButtons />
        </div>
      </div>
    </div>
  );
}
