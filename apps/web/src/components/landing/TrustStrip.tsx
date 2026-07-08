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
      <div className="flex flex-wrap items-center justify-between gap-[18px] border-y border-border py-[22px]">
        <span className="font-mono text-[12px] font-medium uppercase tracking-[.08em] text-tertiary">
          Tracks credits on
        </span>
        <div className="flex flex-wrap items-center gap-x-[30px] gap-y-2 font-display text-[17px] font-semibold text-muted">
          {cards.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
