import type { ReactNode } from "react";
import { CheckIcon } from "./icons";

type Tone = "accent" | "warning";
export type Bullet = { bold: string; rest: string };

export function FeatureSection({
  icon,
  tone = "accent",
  title,
  body,
  bullets,
  phone,
  reverse = false,
  className = "",
}: {
  icon: ReactNode;
  tone?: Tone;
  title: string;
  body: ReactNode;
  bullets: Bullet[];
  phone: ReactNode;
  reverse?: boolean;
  className?: string;
}) {
  const toneColor = tone === "accent" ? "text-accent" : "text-warning";
  const chipBg = tone === "accent" ? "bg-accent-soft" : "bg-warning-soft";

  const text = (
    <div>
      <div
        className={`mb-[18px] inline-flex size-11 items-center justify-center rounded-xl ${chipBg} ${toneColor}`}
      >
        {icon}
      </div>
      <h3 className="font-display text-[28px] font-semibold tracking-[-.015em] sm:text-[32px]">
        {title}
      </h3>
      <p className="mt-[14px] max-w-[26em] text-[17px] leading-[1.6] text-body">
        {body}
      </p>
      <div className="mt-[26px] flex flex-col gap-[14px]">
        {bullets.map((b) => (
          <div key={b.bold} className="flex items-start gap-3">
            <CheckIcon
              size={20}
              strokeWidth={2.2}
              className={`mt-0.5 shrink-0 ${toneColor}`}
            />
            <span className="text-[16px] text-ink-soft">
              <strong className="font-semibold">{b.bold}</strong> {b.rest}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  const art = <div className="flex justify-center">{phone}</div>;

  return (
    <div
      className={`mx-auto grid max-w-[1200px] items-center gap-14 px-6 md:grid-cols-2 md:gap-16 md:px-10 ${className}`}
    >
      {reverse ? (
        <>
          <div className="order-2 md:order-1">{art}</div>
          <div className="order-1 md:order-2">{text}</div>
        </>
      ) : (
        <>
          {text}
          {art}
        </>
      )}
    </div>
  );
}
