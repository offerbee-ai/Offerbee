import { Stagger, StaggerItem } from "./motion/Stagger";

const cards = [
  "Amex Platinum",
  "Chase Sapphire",
  "Amex Gold",
  "Cap One Venture X",
  "Hilton Aspire",
];

export function TrustStrip() {
  return (
    <div className="mx-auto mt-6 max-w-[1200px] px-6 md:px-10">
      <Stagger
        className="flex flex-wrap items-center justify-between gap-[18px] border-y border-border py-[22px]"
        stagger={0.08}
      >
        <StaggerItem>
          <span className="font-mono text-[12px] font-medium uppercase tracking-[.08em] text-tertiary">
            Tracks credits on
          </span>
        </StaggerItem>
        <StaggerItem>
          <div className="flex flex-wrap items-center gap-x-[30px] gap-y-2 font-display text-[17px] font-semibold text-muted">
            {cards.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        </StaggerItem>
      </Stagger>
    </div>
  );
}
