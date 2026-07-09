const steps = [
  {
    n: "01",
    title: "Add your cards",
    body: "Pick from 65+ premium cards, or import a wallet CSV.",
  },
  {
    n: "02",
    title: "OfferBee maps the perks",
    body: "Every credit, cycle, and reset date is loaded automatically — nothing to type.",
  },
  {
    n: "03",
    title: "Use them, keep score",
    body: "Mark credits used, watch your captured total climb past every annual fee.",
  },
];

export function HowItWorks() {
  return (
    <div id="how" className="mx-auto max-w-[1200px] px-6 pt-[90px] md:px-10">
      <div className="text-center">
        <div className="font-mono text-[12.5px] font-semibold uppercase tracking-[.1em] text-accent">
          How it works
        </div>
        <h2 className="mt-[14px] font-display text-[34px] font-semibold tracking-[-.02em] sm:text-[42px]">
          Set up in three minutes
        </h2>
      </div>
      <div className="mt-12 grid gap-[26px] md:grid-cols-3">
        {steps.map((s) => (
          <div
            key={s.n}
            className="rounded-[20px] border border-border bg-surface p-[30px]"
          >
            <div className="font-mono text-[13px] font-semibold text-accent">
              {s.n}
            </div>
            <h4 className="mt-[14px] font-display text-[22px] font-semibold">
              {s.title}
            </h4>
            <p className="mt-[10px] text-[15.5px] leading-[1.6] text-body">
              {s.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
