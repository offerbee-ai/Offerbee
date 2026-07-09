const stats = [
  { figure: "$1,240", label: "avg. credits left unused per cardholder each year" },
  { figure: "65+", label: "premium cards with perks mapped out of the box" },
  { figure: "3 min", label: "to set up your whole wallet" },
];

export function Stats() {
  return (
    <div className="mx-auto max-w-[1200px] px-6 pt-20 md:px-10">
      <div className="grid gap-8 rounded-[26px] bg-accent px-8 py-[52px] text-[#FDF1E4] md:grid-cols-3 md:px-12">
        {stats.map((s, i) => (
          <div
            key={s.figure}
            className={
              i > 0
                ? "md:border-l md:border-white/15 md:pl-8"
                : undefined
            }
          >
            <div className="font-mono text-[46px] font-semibold tracking-[-.02em]">
              {s.figure}
            </div>
            <div className="mt-1.5 text-[15px] text-[#F3D3AE]">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
