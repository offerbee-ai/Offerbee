import { PhoneFrame } from "./phone/PhoneFrame";
import { ReviewScreen } from "./phone/ReviewScreen";
import { CardDetailScreen } from "./phone/CardDetailScreen";

/**
 * The one dark band on the (otherwise Honey/light) marketing page. Wrapped in
 * `.theme-onyx` so both the band chrome and the phone mockups render in Onyx.
 */
export function ThemeShowcase() {
  return (
    <div id="themes" className="theme-onyx mt-[100px] bg-background text-ink">
      <div className="mx-auto grid max-w-[1200px] items-center gap-14 px-6 py-[84px] md:grid-cols-[.95fr_1.05fr] md:gap-14 md:px-10">
        <div>
          <div className="font-mono text-[12.5px] font-semibold uppercase tracking-[.1em] text-accent">
            Light &amp; dark
          </div>
          <h2 className="mt-[14px] font-display text-[34px] font-semibold tracking-[-.02em] text-ink sm:text-[40px]">
            Beautiful at 7am
            <br />
            and midnight
          </h2>
          <p className="mt-4 max-w-[28em] text-[17px] leading-[1.6] text-body">
            OfferBee ships two hand-tuned themes — warm{" "}
            <span className="font-semibold text-accent-strong">Honey</span> for
            daylight and deep{" "}
            <span className="font-semibold text-accent-strong">Onyx</span> for
            night. Same layout, same clarity, matched to your system
            automatically.
          </p>
          <div className="mt-7 flex gap-3">
            <div className="flex items-center gap-[9px] rounded-chip border border-border bg-surface px-[14px] py-[9px]">
              <span className="size-4 rounded-[5px] bg-[#FBF8F0]" />
              <span className="text-[14px] font-semibold">Honey</span>
            </div>
            <div className="flex items-center gap-[9px] rounded-chip border border-border bg-surface px-[14px] py-[9px]">
              <span className="size-4 rounded-[5px] bg-[#F59E3C]" />
              <span className="text-[14px] font-semibold">Onyx</span>
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-[26px]">
          <div className="h-[580px]">
            <PhoneFrame scale={0.92}>
              <ReviewScreen theme="onyx" />
            </PhoneFrame>
          </div>
          <div className="hidden h-[580px] sm:block md:mt-[34px]">
            <PhoneFrame scale={0.92}>
              <CardDetailScreen theme="onyx" />
            </PhoneFrame>
          </div>
        </div>
      </div>
    </div>
  );
}
